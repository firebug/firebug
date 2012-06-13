/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Dialog Implementation

var UserMessage =
{
    onLoad: function()
    {
        this.params = window.arguments[0];
    },

    onOK: function()
    {
        var textBox = $("message", window);
        this.params.message = textBox.value;
    },

    onCancel: function()
    {
        this.params.cancel = true;
    }
}

// ********************************************************************************************* //
// Helpers

function $(id, win)
{
    return win.document.getElementById(id);
}

// ********************************************************************************************* //
