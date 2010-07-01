/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

// ************************************************************************************************
// Globals

var item;
var FBL;
var internalFilefieldTextbox;
var browseButton;

function onLoad()
{
    var args = window.arguments[0];
    item = args.item;
    FBL = args.FBL;

    browseButton = document.getElementById("browse-button");

    document.getElementById("name").value = item.label;
    if (item.executable)
    {
        try
        {
            var file = fbXPCOMUtils.CCIN("@mozilla.org/file/local;1", "nsILocalFile");
            file.initWithPath(item.executable);
            document.getElementById("executable").file = file;
        }
        catch(exc) {}
    }

    if (item.cmdline)
        document.getElementById("cmdline").value = item.cmdline;

    onChange();

    // Localization
    internationalizeUI(document);

    if (document.getAnonymousElementByAttribute && !document.getElementById("executable").file)
    {
        setTimeout(function()
        {
            internalFilefieldTextbox = document.getAnonymousElementByAttribute(
                document.getElementById("executable"), "class", "fileFieldLabel");

            if (internalFilefieldTextbox)
            {
                internalFilefieldTextbox.readOnly = false;
                internalFilefieldTextbox.addEventListener("input", function(e) {
                    browseButton.disabled = true;
                    onChange();
                }, false);
            }
        }, 100);
    }
}

function internationalizeUI(doc)
{
    var elements = ["firebug-external-editors-change", "fbNameLabel", "fbExecutableLabel",
        "browse-button", "fbCmdLineLabel"];

    for (var i=0; i<elements.length; i++)
    {
        var element = doc.getElementById(elements[i]);
        if (!element)
            continue;

        if (element.hasAttribute("title"))
            FBL.internationalize(element, "title");

        if (element.hasAttribute("label"))
            FBL.internationalize(element, "label");

        if (element.hasAttribute("value"))
            FBL.internationalize(element, "value");
    }
}

function onAccept()
{
    item.label = document.getElementById("name").value;
    if (!browseButton.disabled)
    {
        var file = document.getElementById("executable").file;
        item.executable = "";
        if (file)
            item.executable = file.path;
    }
    else
    {
        item.executable = internalFilefieldTextbox.value.replace(/^\s+|\s+$/g, '');
    }

    item.cmdline = document.getElementById("cmdline").value;
    window.arguments[1].saveChanges = true;
}

function onChange()
{
    document.documentElement.getButton("accept").disabled =
        !(document.getElementById("name").value &&
        ((browseButton.disabled && internalFilefieldTextbox && internalFilefieldTextbox.value &&
            internalFilefieldTextbox.value.replace(/^\s+|\s+$/g, '')) ||
        (!browseButton.disabled && document.getElementById("executable").file)));
}

function onBrowse()
{
    const Ci = Components.interfaces;
    const nsIFilePicker = Ci.nsIFilePicker;
    var picker = fbXPCOMUtils.CCIN("@mozilla.org/filepicker;1", "nsIFilePicker");
    picker.init(window, "", nsIFilePicker.modeOpen);
    picker.appendFilters(nsIFilePicker.filterApps);

    if ( picker.show() == nsIFilePicker.returnOK && picker.file )
    {
        var execField = document.getElementById("executable");
        execField.file = picker.file;

        if (internalFilefieldTextbox)
        {
            internalFilefieldTextbox.readOnly = true;
        }

        onChange();
        return true;
    }

    return false;
}

// ************************************************************************************************
