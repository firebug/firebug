/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL)
{
    const Cc = Components.classes;
    const Ci = Components.interfaces;

    var externalEditors = [];
    var editors = [];

    var temporaryFiles = [];
    var temporaryDirectory = null;

    Firebug.ExternalEditors = extend(Firebug.Module,
    {
        initializeUI: function()
        {
            Firebug.Module.initializeUI.apply(this, arguments);

            this.loadExternalEditors();
        },

        updateOption: function(name, value)
        {
            if (name.substr(0, 15) == "externalEditors")
                this.loadExternalEditors();
        },

        shutdown: function()
        {
             this.deleteTemporaryFiles();
        },

        // ----------------------------------------------------------------------------------

        getRegisteredEditors()
        {
            var newArray = [];
            if ( editors.length > 0 )
            {
                newArray.push.apply(newArray, editors);
                if ( externalEditors.length > 0 )
                    newArray.push("-");
            }
            if ( externalEditors.length > 0 )
                newArray.push.apply(newArray, externalEditors);

            return newArray;
        },

        loadExternalEditors: function()
        {
            const prefName = "externalEditors";
            const editorPrefNames = ["label", "executable", "cmdline", "image"];

            externalEditors = [];
            var list = this.getPref(this.prefDomain, prefName).split(",");
            for (var i = 0; i < list.length; ++i)
            {
                var editorId = list[i];
                if ( !editorId || editorId == "")
                    continue;
                var item = { id: editorId };
                for( var j = 0; j < editorPrefNames.length; ++j )
                {
                    try {
                        item[editorPrefNames[j]] = this.getPref(this.prefDomain, prefName+"."+editorId+"."+editorPrefNames[j]);
                    }
                    catch(exc)
                    {
                    }
                }
                if ( item.label && item.executable )
                {
                    if (!item.image)
                        item.image = getIconURLForFile(item.executable);
                    externalEditors.push(item);
                }
            }
            return externalEditors;
        },

        // ********* overlay menu support
        //
        onEditorsShowing: function(popup)
        {
            var editors = Firebug.ExternalEditors.getRegisteredEditors();
            if ( editors.length > 0 )
            {
                var lastChild = popup.lastChild;
                FBL.eraseNode(popup);
                var disabled = (!Firebug.currentContext);
                for( var i = 0; i < editors.length; ++i )
                {
                    if (editors[i] == "-")
                    {
                        FBL.createMenuItem(popup, "-");
                        continue;
                    }
                    var item = {label: editors[i].label, image: editors[i].image,
                                    nol10n: true, disabled: disabled };
                    var menuitem = FBL.createMenuItem(popup, item);
                    menuitem.setAttribute("command", "cmd_openInEditor");
                    menuitem.value = editors[i].id;
                }
                FBL.createMenuItem(popup, "-");
                popup.appendChild(lastChild);
            }
        },

        openEditors: function()
        {
            var args = {
                FBL: FBL,
                prefName: this.prefDomain + ".externalEditors"
            };
            openWindow("Firebug:ExternalEditors", "chrome://firebug/content/external/editors.xul", "", args);
        },

        openInEditor: function(context, editorId)
        {
            try
            {
                if (!editorId)
                    return;

                var location;
                if (context)
                {
                    var panel = Firebug.chrome.getSelectedPanel();
                    if (panel)
                    {
                        location = panel.location;
                        if (!location && panel.name == "html")
                            location = context.window.document.location;
                        if (location && (location instanceof Firebug.SourceFile || location instanceof CSSStyleSheet ))
                            location = location.href;
                    }
                }
                if (!location)
                {
                    if (this.tabBrowser.currentURI)
                        location = this.tabBrowser.currentURI.asciiSpec;
                }
                if (!location)
                    return;
                location = location.href || location.toString();
                if (Firebug.filterSystemURLs && isSystemURL(location))
                    return;

                var list = extendArray(editors, externalEditors);
                var editor = null;
                for( var i = 0; i < list.length; ++i )
                {
                    if (editorId == list[i].id)
                    {
                        editor = list[i];
                        break;
                    }
                }
                if (editor)
                {
                    if (editor.handler)
                    {
                        editor.handler(location);
                        return;
                    }
                    var args = [];
                    var localFile = null;
                    var targetAdded = false;
                    if (editor.cmdline)
                    {
                        args = editor.cmdline.split(" ");
                        for( var i = 0; i < args.length; ++i )
                        {
                            if ( args[i] == "%url" )
                            {
                                args[i] = location;
                                targetAdded = true;
                            }
                            else if ( args[i] == "%file" )
                            {
                                if (!localFile)
                                    localFile = this.getLocalSourceFile(context, location);
                                args[i] = localFile;
                                targetAdded = true;
                            }
                        }
                    }
                    if (!targetAdded)
                    {
                        localFile = this.getLocalSourceFile(context, location);
                        if (!localFile)
                            return;
                        args.push(localFile);
                    }
                    FBL.launchProgram(editor.executable, args);
                }
            } catch(exc) { ERROR(exc); }
        },

        // ********************************************************************************************

        getLocalSourceFile: function(context, href)
        {
            if ( isLocalURL(href) )
                return getLocalPath(href);

            var data;
            if (context)
            {
                data = context.sourceCache.loadText(href);
            }
            else
            {
                // xxxHonza: if the fake context is used the source code is always get using
                // (a) the browser cache or (b) request to the server.
                var selectedBrowser = Firebug.chrome.getCurrentBrowser();
                var ctx = {
                    browser: selectedBrowser,
                    window: selectedBrowser.contentWindow
                };
                data = new Firebug.SourceCache(ctx).loadText(href);
            }

            if (!data)
                return;

            if (!temporaryDirectory)
            {
                var tmpDir = DirService.getFile(NS_OS_TEMP_DIR, {});
                tmpDir.append("fbtmp");
                tmpDir.createUnique(nsIFile.DIRECTORY_TYPE, 0775);
                temporaryDirectory = tmpDir;
            }

            var lpath = href.replace(/^[^:]+:\/*/g, "").replace(/\?.*$/g, "").replace(/[^0-9a-zA-Z\/.]/g, "_");
            /* dummy comment to workaround eclipse bug */
            if ( !/\.[\w]{1,5}$/.test(lpath) )
            {
                if ( lpath.charAt(lpath.length-1) == '/' )
                    lpath += "index";
                lpath += ".html";
            }

            if ( getPlatformName() == "WINNT" )
                lpath = lpath.replace(/\//g, "\\");

            var file = QI(temporaryDirectory.clone(), nsILocalFile);
            file.appendRelativePath(lpath);
            if (!file.exists())
                file.create(nsIFile.NORMAL_FILE_TYPE, 0664);
            temporaryFiles.push(file.path);

            var converter = CCIN("@mozilla.org/intl/scriptableunicodeconverter", "nsIScriptableUnicodeConverter");
            converter.charset = 'UTF-8'; // TODO detect charset from current tab
            data = converter.ConvertFromUnicode(data);

            var stream = CCIN("@mozilla.org/network/safe-file-output-stream;1", "nsIFileOutputStream");
            stream.init(file, 0x04 | 0x08 | 0x20, 0664, 0); // write, create, truncate
            stream.write(data, data.length);
            if (stream instanceof nsISafeOutputStream)
                stream.finish();
            else
                stream.close();

            return file.path;
        },

        deleteTemporaryFiles: function()  // TODO call on "shutdown" event to modules
        {
            try {
                var file = CCIN("@mozilla.org/file/local;1", "nsILocalFile");
                for( var i = 0; i < temporaryFiles.length; ++i)
                {
                    file.initWithPath(temporaryFiles[i]);
                    if (file.exists())
                        file.remove(false);
                }
            }
            catch(exc)
            {
            }
            try {
                if (temporaryDirectory && temporaryDirectory.exists())
                    temporaryDirectory.remove(true);
            } catch(exc)
            {
            }
        },

    });

}});