/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/locale",
    "firebug/lib/trace",
    "firebug/lib/system",
    "firebug/lib/dom",
],
function(Firebug, Locale, FBTrace, System, Dom) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIFilePicker = Ci.nsIFilePicker;

var internalFilefieldTextbox;
var browseButton;

// browsing for a new file modifies image and label only if they are autogenereted from filename
var origLabel = "";
var origImage = null;

// would be good to have auto-suggest for popular editors
var defaultCommandLines =
{
    "emacs/vim/gedit/nano/geany":     "+%line %file",
    "sublimetext":                    "%file:%line:%col",
    "notepad++":                      "-n%line %file",
    "emeditor":                       "/l %line %file",
    "IntelliJ IDEA":                  "%{--line %line%} %file",
    "browser":                        "%url",
    "explorer":                       "/select,%file",
    "wget/curl":                      "%url",
    "firefox":                        "http://validator.w3.org/check?uri=%url"
};

// ********************************************************************************************* //
// ChangeEditor Implementation

function ChangeEditor(item)
{
    this.item = item;
}

ChangeEditor.prototype =
{
    onLoad: function(win)
    {
        this.win = win;

        browseButton = this.win.document.getElementById("browse-button");

        this.win.document.getElementById("name").value = this.item.label;
        if (this.item.executable)
        {
            origImage = System.getIconURLForFile(this.item.executable);
            try
            {
                var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
                file.initWithPath(this.item.executable);
                this.win.document.getElementById("executable").file = file;
                origLabel = file.leafName.replace(".exe","");
            }
            catch(exc)
            {
            }
        }

        if (this.item.cmdline)
            this.win.document.getElementById("cmdline").value = this.item.cmdline;

        this.onChange();

        // Localization
        this.internationalizeUI(this.win.document);

        this.win.sizeToContent();

        if (this.win.document.getAnonymousElementByAttribute &&
           !this.win.document.getElementById("executable").file)
        {
            var self = this;
            setTimeout(function()
            {
                internalFilefieldTextbox = self.win.document.getAnonymousElementByAttribute(
                    self.win.document.getElementById("executable"), "class", "fileFieldLabel");

                if (internalFilefieldTextbox)
                {
                    internalFilefieldTextbox.readOnly = false;
                    internalFilefieldTextbox.addEventListener("input", function(e)
                    {
                        browseButton.disabled = (this.value != "");
                        self.onChange();
                    }, false);
                }
            }, 100);
        }
    },

    internationalizeUI: function(doc)
    {
        var elements = doc.getElementsByClassName("fbInternational");
        var attributes = ["title", "label", "value"];
        for (var i=0; i<elements.length; i++)
        {
            if (elements[i].nodeName == "description")
            {
                var localized = Locale.$STR(elements[i].textContent);
                var parser = Cc["@mozilla.org/xmlextras/domparser;1"].createInstance(Ci.nsIDOMParser);
                var doc = parser.parseFromString("<vbox>" + localized + "</vbox>", "text/xml");
                var root = doc.documentElement;

                while (elements[i].firstChild)
                    elements[i].removeChild(elements[i].firstChild);

                for (var j=0; j<root.childNodes.length; j++)
                {
                    // ToDo: Show labels correctly
                    // Namespaces are not inherited from doc, so labels
                    // are not shown as links
                    node = doc.importNode(root.childNodes[j], true);
                    elements[i].appendChild(node);
                }
            }
            else
            {
                for (var j=0; j<attributes.length; j++)
                {
                    if (elements[i].hasAttribute(attributes[j]))
                        Locale.internationalize(elements[i], attributes[j]);
                }
            }
        }
    },

    onAccept: function()
    {
        this.item.label = this.win.document.getElementById("name").value;

        if (!browseButton.disabled)
        {
            var file = this.win.document.getElementById("executable").file;
            this.item.executable = "";
            if (file)
                this.item.executable = file.path;
        }
        else
        {
            this.item.executable = internalFilefieldTextbox.value.replace(/^\s+|\s+$/g, '');
        }

        this.item.cmdline = this.win.document.getElementById("cmdline").value;
        if (this.item.image == origImage)
            this.item.image = System.getIconURLForFile(this.item.executable);

        try
        {
            var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
            file.initWithPath(this.item.executable);
            if (!file.isExecutable())
               throw "NotAnExecutable";

            this.win.arguments[1].saveChanges = true;
            return true;
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("changeEditor.onAccept; EXCEPTION " + exc, exc);

            var promptService = Cc["@mozilla.org/embedcomp/prompt-service;1"].createInstance(
                Ci.nsIPromptService);

            if (exc == "NotAnExecutable")
            {
                promptService.alert(null, Locale.$STR("changeEditor.Invalid_Application_Path"),
                    Locale.$STR("changeEditor.Path_is_not_an_executable"));
            }
            else
            {
                promptService.alert(null, Locale.$STR("changeEditor.Invalid_Application_Path"),
                    Locale.$STR("changeEditor.Application_does_not_exist"));
            }

            return false;
        }
    },

    onChange: function()
    {
        this.win.document.documentElement.getButton("accept").disabled = !(
            this.win.document.getElementById("name").value && (
                (browseButton.disabled && internalFilefieldTextbox &&
                    internalFilefieldTextbox.value &&
                    internalFilefieldTextbox.value.replace(/^\s+|\s+$/g, '')) ||
                (!browseButton.disabled && this.win.document.getElementById("executable").file)
            )
        );
    },

    onBrowse: function()
    {
        var picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
        picker.init(this.win, "", nsIFilePicker.modeOpen);
        picker.appendFilters(nsIFilePicker.filterApps);

        if (picker.show() == nsIFilePicker.returnOK && picker.file)
        {
            var nameField = this.win.document.getElementById("name");
            var execField = this.win.document.getElementById("executable");
            execField.file = picker.file;

            if (internalFilefieldTextbox)
                internalFilefieldTextbox.readOnly = true;

            if (nameField.value == origLabel || nameField.value == "")
                origLabel = nameField.value = execField.file.leafName.replace(".exe","");

            this.onChange();
            return true;
        }

        return false;
    },

    insertText: function(text, whole)
    {
        var textbox = this.win.document.getElementById("cmdline");
        if (whole)
            textbox.select();

        textbox.editor.QueryInterface(Ci.nsIPlaintextEditor).insertText(text);
        textbox.focus();
    },

    testEditor: function()
    {
        var tmpItem = {};
        var file = this.win.document.getElementById("executable").file;
        if (file)
            tmpItem.executable = file.path;

        tmpItem.cmdline = this.win.document.getElementById("cmdline").value;

        Firebug.ExternalEditors.open(Firebug.Firefox.getCurrentBrowser().currentURI.spec, 5, tmpItem);
    },

    suggestionPopupShowing: function(popup)
    {
        Dom.eraseNode(popup);

        for (var i in defaultCommandLines)
        {
            var box = this.win.document.createElement("hbox");
            var label = this.win.document.createElement("label");
            label.setAttribute("value", i + ': ');
            box.appendChild(label);

            var spacer = this.win.document.createElement("spacer");
            spacer.setAttribute("flex", 1);
            box.appendChild(spacer);

            label = this.win.document.createElement("label");
            label.setAttribute("value", defaultCommandLines[i]);
            label.className = "text-link";
            box.appendChild(label);

            popup.appendChild(box);
        }
    }
}

// ********************************************************************************************* //
// Registration

return ChangeEditor;

// ********************************************************************************************* //
});
