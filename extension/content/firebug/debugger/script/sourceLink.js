/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
],
function(FBTrace, Obj) {

// ********************************************************************************************* //
// Constants

function SourceLink(url, line, type, object, instance, col)
{
    this.href = url;
    this.instance = instance;
    this.line = line;
    this.type = type;
    this.object = object;
    this.col = col;

    // The target line is always highlighted by default. This can be switched off
    // by setting 'highlight' to false (e.g. used by the Script panel when restoring
    // the vertical scroll-bar).
    this.options = {
        highlight: true
    };
};

SourceLink.prototype =
{
    getURL: function()
    {
        return this.href;
    },

    toString: function()
    {
        return this.href + "@" + (this.line || "?");
    },

    toJSON: function() // until 3.1...
    {
        return "{\"href\":\"" + this.href + "\", " +
            (this.line ? ("\"line\":" + this.line + ","):"") +
            (this.type ? (" \"type\":\"" + this.type + "\","):"") +
            "}";
    },

    getOptions: function()
    {
        return Obj.extend(this.options, {});
    }
};

// ********************************************************************************************* //
// Registration

return SourceLink;

// ********************************************************************************************* //
});
