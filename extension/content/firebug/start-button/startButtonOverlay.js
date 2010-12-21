/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ********************************************************************************************* //
// Constants

var popup = $("fbStatusContextMenu");
var firebugButton = $("firebug-button");

// ********************************************************************************************* //
// Module Implementation

Firebug.StartButton = extend(Firebug.Module,
{
    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        firebugButton.appendChild(popup.cloneNode(true));
    },

    shutdown: function()
    {
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.StartButton);

// ********************************************************************************************* //
}});