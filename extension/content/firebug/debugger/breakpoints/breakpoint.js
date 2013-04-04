/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //

function Breakpoint(href, lineNumber, disabled,type)
{
    this.href = href;
    this.lineNo = lineNumber;
    this.type = 1; //BP_NORMAL
    this.disabled = disabled;
    this.hitCount = -1;
    this.hit = 0;
    this.condition = null;
    this.type = type;

    // Transient parameters (not serialized into breakpoints.json)
    this.params = {};
}

Breakpoint.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Transient Members

    getName: function()
    {
        return this.params.name;
    },

    setName: function(name)
    {
        this.params.name = name;
    },

    getSourceLine: function()
    {
        return this.params.sourceLine;
    },

    setSourceLine: function(sourceLine)
    {
        this.params.sourceLine = sourceLine;
    },

    isEnabled: function()
    {
        return !this.disabled;
    },

    isDisabled: function()
    {
        return this.disabled;
    },

    isNormal: function()
    {
        return this.type & 1; //BP_NORMAL
    },

    isError: function()
    {
        return this.type & 16; //BP_ERROR
    }
}

// ********************************************************************************************* //
// Registration

return Breakpoint;

// ********************************************************************************************* //
});
