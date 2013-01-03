/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
const names = ["label", "executable", "cmdline", "image"];

// ************************************************************************************************
// Globals

var gEditorManager =
{
    _tree : null,
    _data : [],
    _removeButton : null,
    _changeButton : null,
    _moveUpButton : null,

    init: function()
    {
        var args = window.arguments[0];
        this._FBL = args.FBL;
        this._prefName = args.prefName;

        (this._removeButton = document.getElementById("removeEditor")).disabled = true;
        (this._changeButton = document.getElementById("changeEditor")).disabled = true;
        (this._moveUpButton = document.getElementById("moveUpEditor")).disabled = true;

        this._tree = document.getElementById("editorsList");

        this._treeView =
        {
            data: this._data,
            selection: null,

            get rowCount() { return this.data.length; },
            getCellText: function(row, column)
            {
                switch(column.id)
                {
                case "editorName":
                    return " "+this.data[row].label;
                case "editorExecutable":
                    return this.data[row].executable;
                case "editorParams":
                    return this.data[row].cmdline;
                }
                return "";
            },
            setTree: function(treebox){ this.treebox = treebox; },
            isContainer: function(row) { return false; },
            isContainerOpen: function(row) { return false; },
            isContainerEmpty: function(row) { return false; },
            isSeparator: function(row) { return false; },
            isSorted: function() { return false; },
            getLevel: function(row) { return 0; },
            getImageSrc: function(row,column) { return column.id=="editorName" ? this.data[row].image : null; },
            getRowProperties: function(row,props) {},
            getCellProperties: function(row,column,props) {},
            getColumnProperties: function(colid,column,props) {}
        };

        this._load();
        this._tree.view = this._treeView;

        this.internationalizeUI(document);
    },

    uninit: function()
    {
    },

    internationalizeUI: function(doc)
    {
        var elements = doc.getElementsByClassName("fbInternational");
        var attributes = ["title", "label", "value"];
        for (var i=0; i<elements.length; i++)
        {
            for(var j=0; j<attributes.length; j++)
            {
                if (elements[i].hasAttribute(attributes[j]))
                    this._FBL.internationalize(elements[i], attributes[j]);
            }
        }
    },

    onSelectionChanged: function()
    {
        var selection = this._tree.view.selection, disabled = (selection.count != 1);
        this._removeButton.disabled = disabled;
        this._changeButton.disabled = disabled;
        this._moveUpButton.disabled = disabled || (selection.currentIndex == 0);
    },

    addEditorHandler: function()
    {
        var item = { label: "", executable: null, cmdline: "" };
        var result = {};
        var args = {
            item: item,
            FBL: this._FBL
        };

        openDialog("chrome://firebug/content/firefox/external-editors/changeeditor.xul",
            "_blank", "modal,centerscreen,resizable", args, result);

        if (result.saveChanges)
        {
            item.id = item.label.replace(/\W/g, "_");
            this._saveItem(item);

            this._loadItem(item);
            this._data.push(item);
            this._tree.view = this._treeView;

            var editors = [];
            try {
                editors = prefs.getCharPref(this._prefName).split(",");
                for( var i = 0; i < editors.length; ++i )
                {
                    if ( editors[i].replace(/^\s+|\s+$/,"") == "" )
                        editors.splice(i, 1);
                }
            }
            catch(exc)
            {
                this._FBL.ERROR(exc);
            }
            editors.push(item.id);
            prefs.setCharPref(this._prefName, editors.join(","));
        }
    },

    removeEditorHandler: function()
    {
        var selection = this._tree.view.selection;
        if (selection.count < 1)
            return;
        var item = this._data[selection.currentIndex];
        this._data.splice(selection.currentIndex, 1);
        this._tree.view = this._treeView;

        try {
            var editors = prefs.getCharPref(this._prefName).split(",");
            this._FBL.remove(editors, item.id);
            prefs.setCharPref(this._prefName, editors.join(","));
            prefs.deleteBranch(this._prefName+"."+item.id);
        }
        catch(exc)
        {
            this._FBL.ERROR(exc);
        }
        // update disabled state of buttons
        if (this._data.length == 0)
            selection.clearSelection();
    },

    changeEditorHandler: function()
    {
        var selection = this._tree.view.selection;
        if (selection.count != 1)
            return;
        var item = this._data[selection.currentIndex];
        var args = {
            item: item,
            FBL: this._FBL
        };
        var result = {};

        openDialog("chrome://firebug/content/firefox/external-editors/changeeditor.xul",
            "_blank", "modal,centerscreen", args, result);

        if (result.saveChanges)
        {
            this._saveItem(item);
        }
        this._loadItem(item);
        this._tree.view = this._treeView;
    },

    moveUpEditorHandler: function()
    {
        var selection = this._tree.view.selection;
        if (selection.count < 1)
            return;
        var item = this._data[selection.currentIndex];
        this._data.splice(selection.currentIndex, 1);
        this._data.unshift(item);
        this._tree.view = this._treeView;
        try {
            var editors = this._data.map(function(x) x.id);
            prefs.setCharPref(this._prefName, editors.join(","));
        }
        catch(exc)
        {
            this._FBL.ERROR(exc);
        }
    },


    _loadItem: function(item)
    {
        const prefName = this._prefName;
        for( var i = 0; i < names.length; ++i )
        {
            try {
                item[names[i]] = prefs.getCharPref(prefName+"."+item.id+"."+names[i]);
            }
            catch(exc)
            {}
        }
        if (!item.image)
            item.image = this._FBL.getIconURLForFile(item.executable);
    },

    _saveItem: function(item)
    {
        if ( item.image && item.image == this._FBL.getIconURLForFile(item.executable) )
            item.image = null;

        const prefName = this._prefName;
        for( var i = 0; i < names.length; ++i )
        {
            try {
                var value = item[names[i]];
                if ( value )
                    prefs.setCharPref(prefName+"."+item.id+"."+names[i], value);
                else
                    prefs.clearUserPref(prefName+"."+item.id+"."+names[i]);
            }
            catch(exc)
            {}
        }
    },

    _load: function()
    {
        try {
            var list = prefs.getCharPref(this._prefName).split(",");
            for (var i = 0; i < list.length; ++i)
            {
                var editorId = list[i].replace(/\s/g, "_");
                if ( !editorId )
                    continue;
                var item = { id: editorId };
                this._data.push(item);
                this._loadItem(item);
            }
        }
        catch(exc)
        {
            this._FBL.ERROR(exc);
        }
    }
};

// ************************************************************************************************
// URLMappings
Cu.import("resource://firebug/loader.js");

var headerName = "X-Local-File-Path";
var headerExplaination = "\
// the following regexp is used by firebug to determine\n\
// if it should send request to the server to get\n\
// file path with " + headerName + " header\n\
// defalt value is ^https?:\\/\\/(localhost)(\\/|:|$)";

var listExplaination = "\
// list of mappings in the form\n\
// ^https?:\\/\\/my.domain.com/ => c:\\php/www\\ \n\
// ";
var noMapping = "no mappings for tested url";
var willQueryServer = "for this url Firebug will send query to server";

var splitter = " => ";
var gUrlMappingManager = {
    init: function()
    {
        var Firebug = opener.Firebug;
        var extModule = Firebug.ExternalEditors;
        this.checkHeaderRe = extModule.checkHeaderRe;
        this.pathTransformations = extModule.pathTransformations;

        var val = [
            headerExplaination,    "\n",
            headerName, splitter, extModule.checkHeaderRe.source,
            "\n\n",
            listExplaination,
            "\n"
        ];

        for (var i = 0; i < this.pathTransformations.length; i++)
        {
            var transform = this.pathTransformations[i];
            val.push(transform.regexp.source, splitter, transform.filePath, '\n');
        }

        val.push(splitter, "\n");

        document.getElementById("urlMappings").value = val.join("");
        document.getElementById("test").value = Firebug.Firefox.getCurrentBrowser().currentURI.spec;

        this.onMainInput();
    },

    uninit: function()
    {
        this.save();
        opener.Firebug.ExternalEditors.saveUrlMappings();
    },

    save: function()
    {
        var checkHeaderRe = this.checkHeaderRe;
        var pathTransformations = this.pathTransformations;

        FirebugLoader.forEachWindow(function(win)
        {
            var extModule = win.Firebug.ExternalEditors;
            delete extModule.pathTransformations;
            delete extModule.checkHeaderRe;
            extModule.checkHeaderRe = checkHeaderRe;
            extModule.pathTransformations = pathTransformations;
        });
    },

    parse: function(val)
    {
        var lines = val.split(/(?:\n\r|\n|\r)/);
        var errors = this.errors = [];
        function addRegexp(source, line)
        {
            if (!source)
                return;

            try
            {
                source = source.replace(/\\?\//g, '\\/');
                return RegExp(source, 'i');
            }
            catch(e)
            {
                errors.push(line + ': ' + e);
                return null;
            }
        }

        this.pathTransformations = [];
        this.checkHeaderRe = null;
        for (var i in lines)
        {
            var line = lines[i].split('=>');

            if (!line[1] || !line[0])
                continue;

            var start = line[0].trim();
            var end = line[1].trim();

            if (start[0] == '/' && start[1] == '/')
                continue;

            if (start == headerName)
            {
                if (this.checkHeaderRe)
                    erors.push(i);
                else
                    this.checkHeaderRe = addRegexp(end, i);
                continue;
            }
            var t = {
                regexp: addRegexp(start, i),
                filePath: end
            };
            if (t.regexp && t.filePath)
                this.pathTransformations.push(t);
        }

        if (!this.checkHeaderRe)
            this.checkHeaderRe = /^$/;
    },

    onTestInput: function()
    {
        var testBox = document.getElementById("test");
        var resultBox = document.getElementById("result");
        var href = testBox.value;

        if (this.checkHeaderRe.test(href))
        {
            resultBox.value = "firebug will send query to server";
        }
        else
        {
            for (var i = 0; i < this.pathTransformations.length; i++)
            {
                var transform = this.pathTransformations[i];
                if (transform.regexp.test(href))
                {
                    var path = href.replace(transform.regexp, transform.filePath);
                    break;
                }
            }

            if (path)
            {
                resultBox.style.cssText = "box-shadow: 0px 0px 1.5px 1px lime;";
                href = path;
            }

            resultBox.value = href.replace(/([^:\\\/])[\\\/]+/g, '$1/');
        }
    },

    onMainInput: function()
    {
        this.parse(document.getElementById("urlMappings").value);
        var resultBox = document.getElementById("result");
        if (this.errors.length)
        {
            resultBox.value = this.errors;
            resultBox.style.cssText = "box-shadow: 0px 0px 1.5px 1px red;";
        } else
        {
            resultBox.style.cssText = "";
            this.onTestInput();
        }
    },

    schedule: function(funcName)
    {
        if (this._scheduled != "onMainInput")
            this._scheduled = funcName;

        if (this.timeOut != null)
            return;
        this.timeOut = setTimeout(function(_this)
        {
            _this[_this._scheduled]();
            _this._scheduled = _this.timeOut = null;
            _this.save()
        }, 80, this);
    }
};

// ************************************************************************************************

