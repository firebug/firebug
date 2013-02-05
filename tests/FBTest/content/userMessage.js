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
        UserMessage.saveMessage();
    },

    onCancel: function()
    {
        this.params.cancel = true;
    },

    onKeyDown: function(event)
    {
        if (event.keyCode == KeyEvent.DOM_VK_RETURN && (event.metaKey || event.ctrlKey) &&
            !event.shiftKey && !event.altKey)
        {
            UserMessage.saveMessage();
            $("fbTestUserMessage", window).acceptDialog();
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    saveMessage: function()
    {
        var textBox = $("message", window);
        this.params.message = textBox.value;
    }
}

// ********************************************************************************************* //
// Helpers

function $(id, win)
{
    return win.document.getElementById(id);
}

// ********************************************************************************************* //

window.document.addEventListener("keydown", UserMessage.onKeyDown, true);

// ********************************************************************************************* //
