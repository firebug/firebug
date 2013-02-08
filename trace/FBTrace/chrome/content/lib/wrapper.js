/* See license.txt for terms of usage */

define([], function() {

// ********************************************************************************************* //
// Constants

var Wrapper = {};

// ********************************************************************************************* //
// Wrappers

Wrapper.getContentView = function(object)
{
    if (isPrimitive(object))
        return object;

    return object.wrappedJSObject;
};

Wrapper.unwrapIValue = function(object, viewChrome)
{
    var unwrapped = object.getWrappedValue();
    if (viewChrome)
        return unwrapped;

    try
    {
        // XPCSafeJSObjectWrapper is not defined in Firefox 4.0
        // this should be the only call to getWrappedValue in firebug
        if (typeof(XPCSafeJSObjectWrapper) != "undefined")
        {
            return XPCSafeJSObjectWrapper(unwrapped);
        }
        else if (typeof(unwrapped) == "object")
        {
            var result = XPCNativeWrapper.unwrap(unwrapped);
            if (result)
                return result;
        }
    }
    catch (exc)
    {
    }

    return unwrapped;
};

function isPrimitive(obj)
{
    return !(obj && (typeof obj === "object" || typeof obj === "function"));
}

// ********************************************************************************************* //

return Wrapper;

// ********************************************************************************************* //
});
