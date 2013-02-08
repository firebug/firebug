/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/object",
    "fbtrace/lib/array",
    "fbtrace/traceMessage",
],
function(FBTrace, Obj, Arr, TraceMessage) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// ********************************************************************************************* //
// Imported message

var ImportedMessage = function(logMsg)
{
    this.type = logMsg.type;
    this.text = logMsg.text;
    this.obj = null;
    this.stack = logMsg.stack;
    this.time = logMsg.time;
}

ImportedMessage.prototype = Obj.extend(TraceMessage.prototype,
{
    getStackArray: function()
    {
        return Arr.cloneArray(this.stack);
    },
})

// ********************************************************************************************* //
// Registration

return ImportedMessage;

// ********************************************************************************************* //
});
