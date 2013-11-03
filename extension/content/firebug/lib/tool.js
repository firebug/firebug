/* See license.txt for terms of usage */

define([
],
function() {

"use strict";

// ********************************************************************************************* //
// Implementation

var FirebugTool = function(name)
{
    this.toolName = name;
    this.active = false;
};

FirebugTool.prototype =
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

return FirebugTool;

// ********************************************************************************************* //
});
