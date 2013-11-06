/* See license.txt for terms of usage */

define([
],
function() {

"use strict";

// ********************************************************************************************* //
// Tool Implementation

function Tool(name)
{
    this.toolName = name;
    this.active = false;
};

Tool.prototype =
{
    getName: function()
    {
        return this.toolName;
    },

    getActive: function()
    {
        return this.active;
    },

    setActive: function(active)
    {
        this.active = !!active;
    }
};

// ********************************************************************************************* //
// Registration

return Tool;

// ********************************************************************************************* //
});
