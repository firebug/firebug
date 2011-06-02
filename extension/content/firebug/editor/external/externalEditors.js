/* See license.txt for terms of usage */

define([
    "firebug/lib/lib",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/locale",
    "firebug/lib/xpcom",
    "firebug/lib/url",
    "firebug/js/sourceLink",
    "firebug/lib/css",
    "firebug/firefox/system",
    "firebug/lib/array",
    "firebug/lib/dom",
    "firebug/firefox/menu",
    "firebug/trace/debug",
    "firebug/firefox/firefox",
],
function(FBL, Obj, Firebug, Locale, Xpcom, Url, SourceLink, Css, System, Arr, Dom,
    Menu, Debug, Firefox) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const DirService = Xpcom.CCSV("@mozilla.org/file/directory_service;1", "nsIDirectoryServiceProvider");
const NS_OS_TEMP_DIR = "TmpD"
const nsIFile = Ci.nsIFile;
const nsILocalFile = Ci.nsILocalFile;
const nsISafeOutputStream = Ci.nsISafeOutputStream;
const nsIURI = Ci.nsIURI;

const prefDomain = "extensions.firebug";

var editors = [];
var externalEditors = [];
var temporaryFiles = [];
var temporaryDirectory = null;

// ********************************************************************************************* //
// Module Implementation

Firebug.ExternalEditors = Obj.extend(Firebug.Module,
{
    dispatchName: "externalEditors",

    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);
        Firebug.registerUIListener(this)
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    registerEditor: function()
    {
        editors.push.apply(editors, arguments);
    },

    getRegisteredEditors: function()
    {
        var newArray = [];
        if (editors.length > 0)
        {
            newArray.push.apply(newArray, editors);
            if (externalEditors.length > 0)
                newArray.push("-");
        }

        if (externalEditors.length > 0)
            newArray.push.apply(newArray, externalEditors);

        return newArray;
    },

    loadExternalEditors: function()
    {
        const prefName = "externalEditors";
        const editorPrefNames = ["label", "executable", "cmdline", "image"];

        externalEditors = [];
        var prefDomain = Firebug.Options.getPrefDomain();
        var list = Firebug.Options.getPref(prefDomain, prefName).split(",");
        for (var i = 0; i < list.length; ++i)
        {
            var editorId = list[i];
            if (!editorId || editorId == "")
                continue;

            var item = { id: editorId };
            for (var j = 0; j < editorPrefNames.length; ++j)
            {
                try
                {
                    item[editorPrefNames[j]] = Firebug.Options.getPref(prefDomain, prefName+"."+
                        editorId+"."+editorPrefNames[j]);
                }
                catch(exc)
                {
                }
            }

            if (item.label && item.executable)
            {
                if (!item.image)
                    item.image = System.getIconURLForFile(item.executable);
                externalEditors.push(item);
            }
        }
        return externalEditors;
    },

    getDefaultEditor: function()
    {
        return externalEditors[0] || editors[0];
    },

    count: function()
    {
        return externalEditors.length + editors.length;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Overlay menu support

    onEditorsShowing: function(popup)
    {
        var editors = this.getRegisteredEditors();

        Dom.eraseNode(popup);
        for( var i = 0; i < editors.length; ++i )
        {
            if (editors[i] == "-")
            {
                Menu.createMenuItem(popup, "-");
                continue;
            }
            var item = {
                label: editors[i].label,
                image: editors[i].image,
                nol10n: true
            };

            var menuitem = Menu.createMenuItem(popup, item);
            menuitem.value = editors[i].id;
        }

        if (editors.length > 0)
            Menu.createMenuItem(popup, "-");

        Menu.createMenuItem(popup, {
            label: Locale.$STR('firebug.Configure_Editors'),
            option: 'openEditorList'
        });
    },

    openEditorList: function()
    {
        var args = {
            FBL: FBL,
            prefName: prefDomain + ".externalEditors"
        };

        Firefox.openWindow("Firebug:ExternalEditors",
            "chrome://firebug/content/editor/external/editors.xul",
            "", args);
    },

    onContextMenu: function(items, object, target, context, panel, popup)
    {
        if (!this.count())
            return

        if (object instanceof SourceLink.SourceLink)
        {
            var sourceLink = object;
            this.appendContextMenuItem(popup, sourceLink.href,
                sourceLink.line);
        }
        else if (panel)
        {
            var sourceLink = panel.getSourceLink(target, object);
            if (sourceLink)
                this.appendContextMenuItem(popup, sourceLink.href,
                    sourceLink.line);
        }
        else if (Css.hasClass(target, "stackFrameLink"))
            this.appendContextMenuItem(popup, target.innerHTML, target.getAttribute("lineNumber"));
    },

    createContextMenuItem: function(doc)
    {
        var item = doc.createElement('menu');
        item.setAttribute('type', "splitmenu");
        item.setAttribute('iconic', "true");
        item.setAttribute('oncommand', "Firebug.ExternalEditors.onContextMenuCommand(event)");
        var menupopup = doc.createElement('menupopup');
        menupopup.setAttribute('onpopupshowing', "return Firebug.ExternalEditors.onEditorsShowing(this)");
        item.appendChild(menupopup);
        return item;
    },

    appendContextMenuItem: function(popup, url, line)
    {
        var editor = this.getDefaultEditor();
        var doc = popup.ownerDocument;
        var item = doc.getElementById('menu_firebugOpenWithEditor');
        if (item)
        {
            item = item.cloneNode(true);
            item.hidden = false;
            item.removeAttribute('openFromContext');
        }
        else
            item = this.createContextMenuItem(doc);
        item.setAttribute('image', editor.image);
        item.setAttribute('label', editor.label);
        item.value = editor.id;

        popup.appendChild(item);

        this.lastSource={url: url, line: line};
    },

    onContextMenuCommand: function(event)
    {
        if (event.target.getAttribute('option') == 'openEditorList')
            this.openEditorList();
        else if(event.currentTarget.hasAttribute('openFromContext'))
            this.openContext(Firebug.currentContext, event.target.value);
        else
            this.open(this.lastSource.url, this.lastSource.line, event.target.value);
    },

    openContext: function(context, editorId)
    {
        var url = Firebug.chrome.getSelectedPanelURL();
        this.open(url, null, editorId, context)
    },

    open: function(href, line, editorId, context)
    {
        try
        {
            if (!href)
                return;
            var editor = null;
            if (editorId)
            {
                var list = Arr.extendArray(externalEditors, editors);
                for (var i = 0; i < list.length; ++i)
                {
                    if (editorId == list[i].id)
                    {
                        editor = list[i];
                        break;
                    }
                }
            }
            else
            {
                editor = this.getDefaultEditor();
            }

            if (!editor)
                 return;

            if (editor.handler)
            {
                editor.handler(href,line);
                return;
            }

            var args = [];
            var localFile = null;
            var targetAdded = false;
            var cmdline = editor.cmdline
            if (cmdline)
            {
                cmdline = cmdline.replace(' ', '\x00', 'g')

                if (cmdline.indexOf("%line")>-1)
                {
                    line = parseInt(line);
                    if (typeof line == 'number' && !isNaN(line))
                        cmdline = cmdline.replace('%line', line, 'g');
                    else //don't send argument with bogus line number
                    {
                        var i = cmdline.indexOf("%line");
                        var i2 = cmdline.indexOf("\x00", i);
                        if(i2 == -1)
                            i2 = cmdline.length;
                        var i1 = cmdline.lastIndexOf("\x00", i);
                        if(i1 == -1)
                            i1 = 0;
                        cmdline = cmdline.substring(0, i1) + cmdline.substr(i2);
                    }
                }
                if(cmdline.indexOf("%url")>-1)
                {
                    cmdline = cmdline.replace('%url', href, 'g');
                    targetAdded = true;
                }
                else if ( cmdline.indexOf("%file")>-1 )
                {
                    localFile = this.getLocalSourceFile(context, href);
                    if (localFile)
                    {
                        cmdline = cmdline.replace('%file', localFile, 'g');
                        targetAdded = true;
                    }
                }

                cmdline.split(/\x00+/).forEach(function(x){ if(x) args.push(x) })
            }

            if (!targetAdded)
            {
                localFile = this.getLocalSourceFile(context, href);
                if (!localFile)
                    return;
                args.push(localFile);
            }

            System.launchProgram(editor.executable, args);
        }
        catch(exc)
        {
            Debug.ERROR(exc);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getLocalSourceFile: function(context, href)
    {
        var filePath = Url.getLocalOrSystemPath(href)
        if (filePath)
            return filePath;

        var data;
        if (context)
        {
            data = context.sourceCache.loadText(href);
        }
        else
        {
            // xxxHonza: if the fake context is used the source code is always get using
            // (a) the browser cache or (b) request to the server.
            var selectedBrowser = Firefox.getCurrentBrowser();
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
        if (!/\.[\w]{1,5}$/.test(lpath))
        {
            if ( lpath.charAt(lpath.length-1) == '/' )
                lpath += "index";
            lpath += ".html";
        }

        if (getPlatformName() == "WINNT")
            lpath = lpath.replace(/\//g, "\\");

        var file = Firebug.Xpcom.QI(temporaryDirectory.clone(), nsILocalFile);
        file.appendRelativePath(lpath);
        if (!file.exists())
            file.create(nsIFile.NORMAL_FILE_TYPE, 0664);
        temporaryFiles.push(file.path);

        var converter = Firebug.Xpcom.CCIN("@mozilla.org/intl/scriptableunicodeconverter", "nsIScriptableUnicodeConverter");
        converter.charset = 'UTF-8'; // TODO detect charset from current tab
        data = converter.ConvertFromUnicode(data);

        var stream = Firebug.Xpcom.CCIN("@mozilla.org/network/safe-file-output-stream;1", "nsIFileOutputStream");
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
        try
        {
            var file = Firebug.Xpcom.CCIN("@mozilla.org/file/local;1", "nsILocalFile");
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

        try
        {
            if (temporaryDirectory && temporaryDirectory.exists())
                temporaryDirectory.remove(true);
        }
        catch(exc)
        {
        }
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.ExternalEditors);

return Firebug.ExternalEditors;

// ********************************************************************************************* //
});
