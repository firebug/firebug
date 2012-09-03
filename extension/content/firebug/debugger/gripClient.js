/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/debugger/sourceFile",
    "firebug/debugger/rdp",
],
function (Obj, Options, SourceFile, RDP) {

// ********************************************************************************************* //
// Constants and Services

var Cu = Components.utils;

Cu["import"]("resource:///modules/devtools/dbg-client.jsm");
Cu["import"]("resource:///modules/devtools/dbg-server.jsm");

// ********************************************************************************************* //

/**
 * Grip clients are used to retrieve information about the relevant object.
 *
 * @param aClient DebuggerClient
 *        The debugger client parent.
 * @param aGrip object
 *        A pause-lifetime object grip returned by the protocol.
 */
function GripClient(connection, grip)
{
  this.grip = grip;
  this.connection = connection;
}

GripClient.prototype =
{
    getActor: function()
    {
        return this.grip.actor;
    },

    _valid: true,
    get valid() { return this._valid; },
    set valid(aValid) { this._valid = !!aValid; },

    /**
     * Request the name of the function and its formal parameters.
     *
     * @param onResponse function
     *        Called with the request's response.
     */
    getSignature: function GC_getSignature(onResponse)
    {
        if (this.grip["class"] !== "Function")
            throw "getSignature is only valid for function grips.";

        var packet = {
            to: this.getActor(),
            type: RDP.DebugProtocolTypes.nameAndParameters
        };

        this.connection.request(packet, function (response)
        {
            if (onResponse)
                onResponse(response);
        });
    },

    /**
     * Request the names of the properties defined on the object and not its
     * prototype.
     *
     * @param onResponse function Called with the request's response.
     */
    getOwnPropertyNames: function GC_getOwnPropertyNames(onResponse)
    {
        var packet = {
            to: this.getActor(),
            type: RDP.DebugProtocolTypes.ownPropertyNames
        };

        this.connection.request(packet, function (response)
        {
            if (onResponse)
                onResponse(response);
        });
    },

    /**
     * Request the prototype and own properties of the object.
     *
     * @param onResponse function Called with the request's response.
     */
    getPrototypeAndProperties: function GC_getPrototypeAndProperties(onResponse)
    {
        var packet = {
            to: this.getActor(),
            type: RDP.DebugProtocolTypes.prototypeAndProperties
        };

        this.connection.request(packet, function (response)
        {
            if (onResponse)
                onResponse(response);
        });
    },

    /**
     * Request the property descriptor of the object's specified property.
     *
     * @param name string The name of the requested property.
     * @param onResponse function Called with the request's response.
     */
    getProperty: function GC_getProperty(name, onResponse)
    {
        var packet = {
            to: this.getActor(),
            type: RDP.DebugProtocolTypes.property,
            name: name
        };

        this.connection.request(packet, function (response)
        {
            if (onResponse)
                onResponse(response);
        });
    },

    /**
     * Request the prototype of the object.
     *
     * @param onResponse function Called with the request's response.
     */
    getPrototype: function GC_getPrototype(onResponse)
    {
        var packet = {
            to: this.getActor(),
            type: RDP.DebugProtocolTypes.prototype
        };

        this.connection.request(packet, function (response)
        {
            if (onResponse)
                onResponse(response);
        });
    }
};

// ********************************************************************************************* //
// Registration

return GripClient;

// ********************************************************************************************* //
});
