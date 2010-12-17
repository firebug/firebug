/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL)
{
    const Cc = Components.classes;
    const Ci = Components.interfaces;

    var externalEditors = [];
    var editors = [];

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


        get registeredEditors()
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
            var editors = Firebug.ExternalEditors.registeredEditors;
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

    });

}});