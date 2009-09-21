/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const prefs = fbXPCOMUtils.CCSV("@mozilla.org/preferences-service;1", "nsIPrefBranch");
const names = ["label", "executable", "cmdline", "image"];

// ************************************************************************************************
// Globals

var gEditorManager =
{
    _tree : null,
    _data : [],
    _removeButton : null,
    _changeButton : null,

    init: function()
    {
        var args = window.arguments[0];
        this._FBL = args.FBL;
        this._prefName = args.prefName;

        (this._removeButton = document.getElementById("removeEditor")).disabled = true;
        (this._changeButton = document.getElementById("changeEditor")).disabled = true;

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
    },

    uninit: function()
    {
    },

    onSelectionChanged: function()
    {
        var selection = this._tree.view.selection;
        this._removeButton.disabled = (selection.count != 1);
        this._changeButton.disabled = (selection.count != 1);
    },

    addEditorHandler: function()
    {
        var item = { label: "", executable: null, cmdline: "" };
        var result = {};
        var args = {
            item: item,
            FBL: this._FBL
        };
        openDialog("chrome://firebug/content/changeeditor.xul",  "_blank", "modal,centerscreen", args, result);
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
        openDialog("chrome://firebug/content/changeeditor.xul",  "_blank", "modal,centerscreen", args, result);
        if (result.saveChanges)
        {
            this._saveItem(item);
        }
        this._loadItem(item);
        this._tree.view = this._treeView;
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
