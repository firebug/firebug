/* See license.txt for terms of usage */

define([
    "firebug/lib/lib",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/locale",
    "firebug/lib/xpcom",
    "firebug/lib/url",
    "firebug/lib/string",
    "firebug/js/sourceLink",
    "firebug/lib/css",
    "firebug/lib/system",
    "firebug/lib/array",
    "firebug/lib/dom",
    "firebug/chrome/menu",
    "firebug/trace/debug",
    "firebug/chrome/firefox"
],
function(FBL, Obj, Firebug, Locale, Xpcom, Url, Str, SourceLink, Css, System, Arr, Dom,
    Menu, Debug, Firefox) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const DirService = Xpcom.CCSV("@mozilla.org/file/directory_service;1",
    "nsIDirectoryServiceProvider");
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

    getEditor: function(id)
    {
        if (id)
        {
            var list = Arr.extendArray(externalEditors, editors);
            for each(var editor in list)
                if (editor.id == id)
                    return editor;
        }
        else
        {
            return this.getDefaultEditor();
        }
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
            label: Locale.$STR("firebug.Configure_Editors") + "...",
            nol10n: true,
            option: "openEditorList"
        });
    },

    openEditorList: function()
    {
        var args = {
            FBL: FBL,
            prefName: prefDomain + ".externalEditors"
        };

        Firefox.openWindow("Firebug:ExternalEditors",
            "chrome://firebug/content/firefox/external-editors/editors.xul",
            "", args);
    },

    onContextMenu: function(items, object, target, context, panel, popup)
    {
        if (!this.count())
            return

        if (object instanceof SourceLink.SourceLink)
        {
            var sourceLink = object;
            this.appendContextMenuItem(popup, sourceLink.href, sourceLink.line);
        }
        else if (target.id == "fbLocationList")
        {
            if (object.href)
                this.appendContextMenuItem(popup, object.href, 0);
        }
        else if (panel)
        {
            var sourceLink = panel.getSourceLink(target, object);
            if (sourceLink)
                this.appendContextMenuItem(popup, sourceLink.href, sourceLink.line);
        }
        else if (Css.hasClass(target, "stackFrameLink"))
        {
            this.appendContextMenuItem(popup, target.innerHTML, target.getAttribute("lineNumber"));
        }
    },

    createContextMenuItem: function(doc)
    {
        var item = doc.createElement("menu");
        item.setAttribute("type", "splitmenu");
        item.setAttribute("iconic", "true");
        item.setAttribute("oncommand", "Firebug.ExternalEditors.onContextMenuCommand(event)");

        var menupopup = doc.createElement("menupopup");
        menupopup.setAttribute("onpopupshowing",
            "return Firebug.ExternalEditors.onEditorsShowing(this)");

        item.appendChild(menupopup);
        return item;
    },

    appendContextMenuItem: function(popup, url, line)
    {
        var editor = this.getDefaultEditor();
        var doc = popup.ownerDocument;
        var item = doc.getElementById("menu_firebugOpenWithEditor");

        if (item)
        {
            item = item.cloneNode(true);
            item.hidden = false;
            item.removeAttribute("openFromContext");
        }
        else
        {
            item = this.createContextMenuItem(doc);
        }

        item.setAttribute("image", editor.image);
        item.setAttribute("label", editor.label);
        item.value = editor.id;

        popup.appendChild(item);

        this.lastSource={url: url, line: line};
    },

    onContextMenuCommand: function(event)
    {
        if (event.target.getAttribute("option") == "openEditorList")
            this.openEditorList();
        else if (event.currentTarget.hasAttribute("openFromContext"))
            this.openContext(Firebug.currentContext, event.target.value);
        else
            this.open(this.lastSource.url, this.lastSource.line, event.target.value);
    },

    openContext: function(context, editorId)
    {
        var line = null;
        var panel = Firebug.chrome.getSelectedPanel();
        if (panel)
        {
            var box = panel.selectedSourceBox;
            if (box && box.centralLine)
                line = box.centralLine;
        }
        // if firebug isn't active this will redturn documentURI
        var url = Firebug.chrome.getSelectedPanelURL();
        this.open(url, line, editorId, context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // main

    open: function(href, line, editorId, context)
    {
        try
        {
            if (FBTrace.DBG_EXTERNALEDITORS)
                FBTrace.sysout("externalEditors.open; href: " + href + ", line: " + line +
                    ", editorId: " + editorId + ", context: " + context, context);
            if (!href)
                return;

            var editor = this.getEditor(editorId);
            if (!editor)
                 return;

            if (editor.handler)
                return editor.handler(href, line);

            var options = {
                url: href,
                href: href,
                line: line,
                editor: editor,
                cmdline: editor.cmdline
            }
            var self = this;
            this.getLocalSourceFile(options, function(file)
            {
                if (file.exists())
                {
                    if (file.isDirectory())
                    {
                        file.reveal();
                        return;
                    }

                    options.file = file.path;
                }
                var args = self.parseCmdLine(options.cmdline, options);

                if (FBTrace.DBG_EXTERNALEDITORS)
                    FBTrace.sysout("externalEditors.open; launcProgram with args:", args);

                System.launchProgram(editor.executable, args);
            });
        }
        catch(exc)
        {
            Debug.ERROR(exc);
        }
    },

    getLocalSourceFile: function(options, callback)
    {
        var href = options.href;
        var file = Url.getLocalOrSystemFile(href);
        if (file)
            return callback(file);

        if (this.checkHeaderRe.test(href))
        {
            if (FBTrace.DBG_EXTERNALEDITORS)
                FBTrace.sysout("externalEditors. connecting server for", href);

            var req = new XMLHttpRequest;
            req.open("HEAD", href, true);
            req.onloadend = function() {
                var path = req.getResponseHeader("X-Local-File-Path");
                var file = Url.getLocalOrSystemFile(path);
                if (!file)
                {
                    path = 'file:///' + path.replace(/[\/\\]+/g, '/');
                    file = Url.getLocalOrSystemFile(path);
                }
                if (FBTrace.DBG_EXTERNALEDITORS)
                    FBTrace.sysout("externalEditors. server says", path);
                if (file)
                    callback(file);
                // TODO: do we need to notifiy user if path was wrong?
            }
            req.send(null);
            return;
        }


        file = this.transformHref(href);
        if (file)
            return callback(file);

        this.saveToTemporaryFile(href, callback);
    },

    parseCmdLine: function(cmdLine, options)
    {
        var lastI = 0, args = [], argIndex = 0, inGroup;
        var subs = "col|line|file|url".split("|");
        // do not send argument with bogus line number
        function checkGroup()
        {
            var group = args.slice(argIndex), isValid = null;
            for each(var i in subs)
            {
                if (group.indexOf("%"+i) == -1)
                    continue;
                if (options[i] == undefined)
                {
                    isValid = false;
                }
                else
                {
                    isValid = true;
                    break;
                }
            }
            if (isValid == false)
                args = args.slice(0, argIndex);
            argIndex = args.length;
        }
        cmdLine.replace(/(\s+|$)|(?:%([{}]|(%|col|line|file|url)))/g, function(a, b, c, d, i, str)
        {
            var skipped = str.substring(lastI, i);
            lastI = i+a.length;
            skipped && args.push(skipped);

            if (b || !a)
            {
                args.push(" ");
                if (!inGroup)
                    checkGroup();
            } else  if (c == "{") {
                inGroup = true;
            } else  if (c == "}") {
                inGroup = false;
                checkGroup();
            } else  if (d) {
                args.push(a);
            }
        });

        cmdLine = args.join("");
        // add %file
        if (!/%(url|file)/.test(cmdLine))
            cmdLine += " %file";

        args = cmdLine.trim().split(" ");
        args = args.map(function(x)
        {
            return x.replace(/(?:%(%|col|line|file|url))/g, function(a, b){
                if (b == '%')
                    return b;
                if (options[b] == null)
                    return "";
                return options[b];
            });
        })
        return args;
    },
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    transformHref: function(href)
    {
        for each (var transform in this.filePathTransforms)
        {
            if (transform.regexp.test(href))
            {
                var path = href.replace(t.regexp, t.filePath);
                var file = Url.getLocalOrSystemFile(path);
                if (file && file.exists())
                    return file;
            }
        }
    },

    saveToTemporaryFile: function(href, callback)
    {
        var data = Firebug.currentContext.sourceCache.loadText(href);
        var file = this.createTemporaryFile(href, data);

        callback(file);
    },

    createTemporaryFile: function(href, data)
    {
        if (!data)
            return;

        if (!temporaryDirectory)
        {
            var tmpDir = DirService.getFile(NS_OS_TEMP_DIR, {});
            tmpDir.append("fbtmp");
            tmpDir.createUnique(nsIFile.DIRECTORY_TYPE, 0775);
            temporaryDirectory = tmpDir;
        }

        var lpath = href.replace(/^[^:]+:\/*/g, "").replace(/\?.*$/g, "")
            .replace(/[^0-9a-zA-Z\/.]/g, "_");
        /* dummy comment to workaround eclipse bug */
        if (!/\.[\w]{1,5}$/.test(lpath))
        {
            if ( lpath.charAt(lpath.length-1) == '/' )
                lpath += "index";
            lpath += ".html";
        }

        if (System.getPlatformName() == "WINNT")
            lpath = lpath.replace(/\//g, "\\");

        var file = Xpcom.QI(temporaryDirectory.clone(), nsILocalFile);
        file.appendRelativePath(lpath);
        if (!file.exists())
            file.create(nsIFile.NORMAL_FILE_TYPE, 0664);
        temporaryFiles.push(file.path);

        // TODO detect charset from current tab
        data = Str.convertFromUnicode(data);

        var stream = Xpcom.CCIN("@mozilla.org/network/safe-file-output-stream;1",
            "nsIFileOutputStream");
        stream.init(file, 0x04 | 0x08 | 0x20, 0664, 0); // write, create, truncate
        stream.write(data, data.length);

        if (stream instanceof nsISafeOutputStream)
            stream.finish();
        else
            stream.close();

        return file;
    },

    deleteTemporaryFiles: function()  // TODO call on "shutdown" event to modules
    {
        try
        {
            var file = Xpcom.CCIN("@mozilla.org/file/local;1", "nsILocalFile");
            for (var i = 0; i < temporaryFiles.length; ++i)
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

// object.extend doesn't handle getters
Firebug.ExternalEditors.__defineGetter__("filePathTransforms", function()
{
    return null;
});

Firebug.ExternalEditors.__defineGetter__("checkHeaderRe", function()
{
    return null || /^https?:\/\/localhost/i;
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.ExternalEditors);

return Firebug.ExternalEditors;

// ********************************************************************************************* //
});