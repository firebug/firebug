/* See license.txt for terms of usage */

define([
    "firebug/lib/string",
    "firebug/lib/css",
],
function(Str, Css) {

// ********************************************************************************************* //
// Trace Listener

/**
 * Default implementation of a Trace listener. Can be used to customize tracing logs
 * in the console in order to easily distinguish logs.
 */
function TraceListener(prefix, type, removePrefix, stylesheetURL)
{
    this.prefix = prefix;
    this.type = type;
    this.removePrefix = removePrefix;
    this.stylesheetURL = stylesheetURL;
}

TraceListener.prototype =
/** @lends TraceListener */
{
    // Called when console window is loaded.
    onLoadConsole: function(win, rootNode)
    {
        if (this.stylesheetURL)
            Css.appendStylesheet(rootNode.ownerDocument, this.stylesheetURL);
    },

    // Called when a new message is logged in to the trace-console window.
    onDump: function(message)
    {
        var index = message.text.indexOf(this.prefix);
        if (index == 0)
        {
            if (this.removePrefix)
                message.text = message.text.substr(this.prefix.length);

            message.text = Str.trim(message.text);
            message.type = this.type;
        }
    }
};

// ********************************************************************************************* //
// Registration

return TraceListener;

// ********************************************************************************************* //
});
