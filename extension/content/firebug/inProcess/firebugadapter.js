/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

define([
    "firebug/firebug",
    "firebug/lib/events",
    "arch/tools"
],
function initializeFirebugAdapter(Firebug, Events, ToolsInterface) {

// ************************************************************************************************
// Attach the BrowserToolsInterface to Firebug object
Firebug.ToolsAdapter =
{
    updateOption: function()
    {
        // Tell the front end modules that the back end sent us an option update event
        Events.dispatch(Firebug.modules, 'updateOption', arguments);
    }
};
ToolsInterface.browser.addListener(Firebug.ToolsAdapter);

return exports = {};

});