/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/lib/lib",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/locale",
    "firebug/lib/xpcom",
    "firebug/lib/url",
    "firebug/lib/string",
    "firebug/debugger/script/sourceLink",
    "firebug/lib/css",
    "firebug/lib/system",
    "firebug/lib/array",
    "firebug/lib/dom",
    "firebug/chrome/menu",
    "firebug/trace/debug",
    "firebug/chrome/firefox",
    "firebug/firefox/external-editors/editors",
    "firebug/lib/options",
],
function(Module, FBL, Obj, Firebug, Locale, Xpcom, Url, Str, SourceLink, Css, System, Arr, Dom,
    Menu, Debug, Firefox, Editors, Options) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const DirService = Xpcom.CCSV("@mozilla.org/file/directory_service;1",
    "nsIDirectoryServiceProvider");
const NS_OS_TEMP_DIR = "TmpD";
const nsIFile = Ci.nsIFile;
const nsISafeOutputStream = Ci.nsISafeOutputStream;
const nsIURI = Ci.nsIURI;

const prefDomain = "extensions.firebug";

var editors = [];
var externalEditors = [];
var temporaryFiles = [];
var temporaryDirectory = null;

// ********************************************************************************************* //
// Module Implementation

Firebug.ExternalEditors = Obj.extend(Module,
{
    dispatchName: "externalEditors",

    initializeUI: function()
    {
        Module.initializeUI.apply(this, arguments);

        Firebug.registerUIListener(this);
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
        var prefDomain = Options.getPrefDomain();
        var list = Options.getPref(prefDomain, prefName).split(",");

        for (var i=0; i<list.length; ++i)
        {
            var editorId = list[i];
            if (!editorId || editorId == "")
                continue;

            var item = { id: editorId };
            for (var j=0; j<editorPrefNames.length; ++j)
            {
                try
                {
                    item[editorPrefNames[j]] = Options.getPref(prefDomain,
                        prefName + "." + editorId + "." + editorPrefNames[j]);
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
        if (typeof id == "object")
            return id;

        if (!id)
            return this.getDefaultEditor();

        var list = Arr.extendArray(externalEditors, editors);
        for (var i=0; i<list.length; i++)
        {
            var editor = list[i];
            if (editor.id == id)
                return editor;
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
        Dom.eraseNode(popup);

        var editors = this.getRegisteredEditors();
        for (var i=0; i<editors.length; ++i)
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
        Firefox.openWindow("Firebug:ExternalEditors",
            "chrome://firebug/content/firefox/external-editors/editors.xul",
            "", new Editors(prefDomain + ".externalEditors"));
    },

    onContextMenu: function(items, object, target, context, panel, popup)
    {
        if (!this.count())
            return

        if (object instanceof SourceLink)
        {
            this.appendContextMenuItem(popup, object.href, object.line);
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
    },

    createContextMenuItem: function(doc)
    {
        var item = doc.createElement("menu");
        item.setAttribute("iconic", "true");
        item.setAttribute("label", Locale.$STR("firebug.OpenWith"));

        item.addEventListener("command", function(event)
        {
            Firebug.ExternalEditors.onContextMenuCommand(event);
        });

        var menupopup = doc.createElement("menupopup");
        menupopup.addEventListener("popupshowing", function(event)
        {
            return Firebug.ExternalEditors.onEditorsShowing(this);
        });

        item.appendChild(menupopup);
        return item;
    },

    appendContextMenuItem: function(popup, url, line)
    {
        if (FBTrace.DBG_EXTERNALEDITORS)
        {
            FBTrace.sysout("externalEditors.appendContextMenuItem; href: " + url +
                ", line: " + line);
        }

        var editor = this.getDefaultEditor();
        var doc = popup.ownerDocument;
        var item = doc.getElementById("menu_firebug_firebugOpenWithEditor");

        if (item)
        {
            item = item.cloneNode(true);
            item.hidden = false;
            item.removeAttribute("openFromContext");

            item.setAttribute("image", editor.image);
            item.setAttribute("label", editor.label);
            item.value = editor.id;
        }
        else
        {
            item = this.createContextMenuItem(doc);
        }

        popup.appendChild(item);

        this.lastSource = {
            url: url,
            line: line
        };
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
            };

            var self = this;
            this.getLocalFile(options, function(file)
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
                    FBTrace.sysout("externalEditors.open; launch program with args:", args);

                System.launchProgram(editor.executable, args);
            });
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("externalEditors.open; EXCEPTION " + exc, exc);

            Debug.ERROR(exc);
        }
    },

    getLocalFile: function(options, callback)
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
            req.setRequestHeader("X-Line", options.line);
            req.setRequestHeader("X-Column", options.col);
            req.onloadend = function()
            {
                var path = req.getResponseHeader("X-Local-File-Path");
                if (FBTrace.DBG_EXTERNALEDITORS)
                    FBTrace.sysout("externalEditors. server says", path);

                var file = fixupFilePath(path);
                if (file)
                    callback(file);

                // TODO: do we need to notify the user if path was wrong?
                // xxxHonza: note that there can be already a notification
                // coming from external editor (e.g. Notepad has its own
                // error dialog informing about an invalid path).
            };

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
        cmdLine = cmdLine || "";

        var lastI = 0, args = [], argIndex = 0, inGroup;
        var subs = "col|line|file|url".split("|");

        // do not send argument with bogus line number
        function checkGroup()
        {
            var group = args.slice(argIndex), isValid = null;
            for (var i=0; i<subs.length; i++)
            {
                var sub = subs[i];
                if (group.indexOf("%" + sub) == -1)
                    continue;

                if (options[sub] == undefined)
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
            lastI = i + a.length;
            skipped && args.push(skipped);

            if (b || !a)
            {
                args.push(" ");
                if (!inGroup)
                    checkGroup();
            }
            else if (c == "{")
            {
                inGroup = true;
            }
            else if (c == "}")
            {
                inGroup = false;
                checkGroup();
            }
            else if (d)
            {
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
            return x.replace(/(?:%(%|col|line|file|url))/g, function(a, b)
            {
                if (b == "%")
                    return b;
                if (options[b] == null)
                    return "";
                return options[b];
            });
        });

        return args;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    transformHref: function(href)
    {
        for (var i=0; i<this.pathTransformations.length; i++)
        {
            var transform = this.pathTransformations[i];
            if (transform.regexp.test(href))
            {
                var path = href.replace(transform.regexp, transform.filePath);
                var file = fixupFilePath(path);
                if (file && file.exists())
                {
                    if (FBTrace.DBG_EXTERNALEDITORS)
                        FBTrace.sysout("externalEditors. " + href + " transformed to", file.path);
                    return file;
                }
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
            if (lpath.charAt(lpath.length-1) == "/")
                lpath += "index";
            lpath += ".html";
        }

        if (System.getPlatformName() == "WINNT")
            lpath = lpath.replace(/\//g, "\\");

        var file = Xpcom.QI(temporaryDirectory.clone(), nsIFile);
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

    // TODO call on "shutdown" event to modules
    deleteTemporaryFiles: function()
    {
        try
        {
            var file = Xpcom.CCIN("@mozilla.org/file/local;1", "nsIFile");
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

// ********************************************************************************************* //
// Helpers

function fixupFilePath(path)
{
    var file = Url.getLocalOrSystemFile(path);
    if (!file)
    {
        path = "file:///" + path.replace(/[\/\\]+/g, "/");
        file = Url.getLocalOrSystemFile(path);
    }
    return file;
}

// object.extend doesn't handle getters
// xxxHonza: now it does we should fix this.
Firebug.ExternalEditors.__defineGetter__("pathTransformations",
    lazyLoadUrlMappings.bind(Firebug.ExternalEditors, "pathTransformations"));

Firebug.ExternalEditors.__defineGetter__("checkHeaderRe",
    lazyLoadUrlMappings.bind(Firebug.ExternalEditors, "checkHeaderRe"));

function lazyLoadUrlMappings(propName)
{
    delete this.pathTransformations;
    delete this.checkHeaderRe;

    var lines = readEntireFile(userFile("urlMappings.txt")).split(/[\n\r]+/);
    var sp = "=>";

    function safeRegexp(source)
    {
        try
        {
            return RegExp(source, "i");
        }
        catch(e)
        {
        }
    }

    this.pathTransformations = [];
    this.checkHeaderRe = null;

    for (var i in lines)
    {
        var line = lines[i].split("=>");

        if (!line[1] || !line[0])
            continue;

        var start = line[0].trim();
        var end = line[1].trim();

        if (start[0] == "/" && start[1] == "/")
            continue;

        if (start == "X-Local-File-Path")
        {
            this.checkHeaderRe = safeRegexp(end);
            continue;
        }
        var t = {
            regexp: safeRegexp(start, i),
            filePath: end
        };
        if (t.regexp && t.filePath)
            this.pathTransformations.push(t);
    }

    if (!this.checkHeaderRe)
        this.checkHeaderRe = /^https?:\/\/(localhost)(\/|:|$)/i;

    return this[propName];
}

Firebug.ExternalEditors.saveUrlMappings = function()
{
    var sp = " => ";
    var text = [
        "X-Local-File-Path", sp, this.checkHeaderRe.source, "\n\n"
    ];

    for (var i = 0; i < this.pathTransformations.length; i++)
    {
        var t = this.pathTransformations[i];
        text.push(t.regexp, sp, t.filePath, "\n");
    }

    var file = userFile("urlMappings.txt");
    writeToFile(file, text.join(""));
};

// file helpers
function userFile(name)
{
    var file = Services.dirsvc.get("ProfD", Ci.nsIFile);
    file.append("firebug");
    file.append(name);
    return file;
}

function readEntireFile(file)
{
    if (!file.exists())
        return "";

    var data = "", str = {};
    var fstream = Cc["@mozilla.org/network/file-input-stream;1"]
        .createInstance(Ci.nsIFileInputStream);
    var converter = Cc["@mozilla.org/intl/converter-input-stream;1"]
        .createInstance(Ci.nsIConverterInputStream);

    const replacementChar = Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER;
    fstream.init(file, -1, 0, 0);
    converter.init(fstream, "UTF-8", 1024, replacementChar);

    while (converter.readString(4096, str) != 0)
        data += str.value;

    converter.close();

    return data;
}

function writeToFile(file, text)
{
    var fostream = Cc["@mozilla.org/network/file-output-stream;1"]
        .createInstance(Ci.nsIFileOutputStream);
    var converter = Cc["@mozilla.org/intl/converter-output-stream;1"]
        .createInstance(Ci.nsIConverterOutputStream);

    if (!file.exists())
        file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0664);

    fostream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
    converter.init(fostream, "UTF-8", 4096, 0x0000);
    converter.writeString(text);
    converter.close();
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.ExternalEditors);

return Firebug.ExternalEditors;

// ********************************************************************************************* //
});