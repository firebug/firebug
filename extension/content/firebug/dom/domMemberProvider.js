/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false */
/*global FBTrace:true, XPCNativeWrapper:true, Window:true, define:true */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/array",
    "firebug/lib/wrapper",
    "firebug/lib/dom",
    "firebug/lib/locale",
    "firebug/lib/options",
    "firebug/console/closureInspector",
    "firebug/chrome/panelActivation",
    "firebug/chrome/reps",
    "firebug/debugger/debuggerLib",
],
function(Firebug, FBTrace, Obj, Arr, Wrapper, Dom, Locale, Options, ClosureInspector,
    PanelActivation, FirebugReps, DebuggerLib) {

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_DOM");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// DOM Member Provider

function DOMMemberProvider(context)
{
    this.context = context;
}

DOMMemberProvider.prototype =
{
    /**
     * @param object a user-level object wrapped in security blanket
     * @param level for a.b.c, level is 2
     */
    getMembers: function(object, level)
    {
        if (!level)
            level = 0;

        var ordinals = [];
        var userProps = [];
        var userClasses = [];
        var userFuncs = [];
        var domProps = [];
        var domClasses = [];
        var domFuncs = [];
        var domConstants = [];
        var proto = [];
        var domHandlers = [];

        var isScope = ClosureInspector.isScopeWrapper(object);

        try
        {
            // Special case for "arguments", which is not enumerable by for...in statement.
            if (isArguments(object))
                object = Arr.cloneArray(object);

            var properties;
            try
            {
                // Make sure not to touch the prototype chain of the magic scope objects.
                var ownOnly = Options.get("showOwnProperties") || isScope;
                var enumerableOnly = Options.get("showEnumerableProperties");

                properties = this.getObjectProperties(object, enumerableOnly, ownOnly);
                properties = Arr.sortUnique(properties);

                var addOwn = function(prop)
                {
                    if (Obj.contentObjectHasOwnProperty(object, prop) &&
                        properties.indexOf(prop) === -1)
                    {
                        properties.push(prop);
                    }
                };
                addOwn("constructor");
                addOwn("prototype");
                addOwn("wrappedJSObject");

                // __proto__ never shows in enumerations, so add it here. We currently
                // we don't want it when only showing own properties.
                if (object.__proto__ && Obj.hasProperties(object.__proto__) &&
                    properties.indexOf("__proto__") === -1 && !ownOnly)
                {
                    properties.push("__proto__");
                }
            }
            catch (exc)
            {
                if (FBTrace.DBG_ERRORS || FBTrace.DBG_DOM)
                    FBTrace.sysout("dom.getMembers: property lookups failed", exc);
            }

            var name, val;
            var add = function(type, where)
            {
                this.addMember(object, type, where, name, val, level, isScope);
            }.bind(this);

            var tester = new Dom.DOMMemberTester(object);
            for (var i=0; i<properties.length; i++)
            {
                name = properties[i];

                try
                {
                    val = object[name];
                }
                catch (exc)
                {
                    // Sometimes we get exceptions trying to access certain members
                    if (FBTrace.DBG_ERRORS && FBTrace.DBG_DOM)
                        FBTrace.sysout("dom.getMembers cannot access "+name, exc);

                    val = undefined;
                }

                var isInlineEventHandler = Dom.isInlineEventHandler(name);
                var isDOMMember = !isInlineEventHandler && tester.isDOMMember(name);
                if (!isNaN(parseInt(name, 10)))
                {
                    add("ordinal", ordinals);
                }
                else if (typeof val === "function")
                {
                    var isClassFunc = isClassFunction(val);
                    if (isDOMMember && isClassFunc)
                    {
                        add("domClass", domClasses);
                    }
                    else if (isDOMMember)
                    {
                        add("domFunction", domFuncs);
                    }
                    else if (isClassFunc)
                    {
                        add("userClass", userClasses);
                    }
                    else if (!Options.get("showUserFuncs") && Options.get("showInlineEventHandlers") &&
                        isInlineEventHandler)
                    {
                        add("userFunction", domHandlers);
                    }
                    else
                    {
                        add("userFunction", userFuncs);
                    }
                }
                else
                {
                    if (isPrototype(name))
                    {
                        add("proto", proto);
                    }
                    else if (tester.isDOMConstant(name))
                    {
                        add("dom", domConstants);
                    }
                    else if (isDOMMember)
                    {
                        add("dom", domProps);
                    }
                    else if (val === null && object instanceof EventTarget && isInlineEventHandler)
                    {
                        add("dom", domHandlers);
                    }
                    else
                    {
                        add("user", userProps);
                    }
                }
            }

            if (this.context && this.shouldShowClosures() &&
                (isScope || typeof object === "function"))
            {
                this.maybeAddClosureMember(object, "proto", proto, level, isScope);
            }
        }
        catch (exc)
        {
            // Sometimes we get exceptions just from trying to iterate the members
            // of certain objects, like StorageList, but don't let that gum up the works
            if (FBTrace.DBG_DOM)
                FBTrace.sysout("dom.getMembers FAILS: ", exc);
        }

        function sortName(a, b) { return a.name > b.name ? 1 : -1; }
        function sortOrdinal(a, b) { return a.name - b.name; }

        var members = [];

        ordinals.sort(sortOrdinal);
        members.push.apply(members, ordinals);

        if (Options.get("showUserProps"))
        {
            userProps.sort(sortName);
            members.push.apply(members, userProps);
        }

        if (Options.get("showUserFuncs"))
        {
            userClasses.sort(sortName);
            members.push.apply(members, userClasses);

            userFuncs.sort(sortName);
            members.push.apply(members, userFuncs);
        }

        if (Options.get("showDOMProps"))
        {
            domProps.sort(sortName);
            members.push.apply(members, domProps);
        }

        if (Options.get("showDOMFuncs"))
        {
            domClasses.sort(sortName);
            members.push.apply(members, domClasses);

            domFuncs.sort(sortName);
            members.push.apply(members, domFuncs);
        }

        if (Options.get("showDOMConstants"))
            members.push.apply(members, domConstants);

        members.push.apply(members, proto);

        if (Options.get("showInlineEventHandlers"))
        {
            domHandlers.sort(sortName);
            members.push.apply(members, domHandlers);
        }

        if (FBTrace.DBG_DOM)
        {
            var showEnum = Options.get("showEnumerableProperties");
            var showOwn = Options.get("showOwnProperties");
            FBTrace.sysout("dom.getMembers; Report: enum-only: " + showEnum +
                ", own-only: " + showOwn + ", total members: " + members.length,
            {
                members: members,
                object: object,
                ordinals: ordinals,
                userProps: userProps,
                userFuncs: userFuncs,
                userClasses: userClasses,
                domProps: domProps,
                domFuncs: domFuncs,
                domConstants: domConstants,
                domHandlers: domHandlers,
                proto: proto
            });
        }

        return members;
    },

    addMember: function()
    {
        try
        {
            return this.addMemberInternal.apply(this, arguments);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("domPanel.addMember; EXCEPTION " + err, err);
        }
    },

    shouldShowClosures: function()
    {
        return Options.get("showClosures") && PanelActivation.isPanelEnabled("script");
    },

    hasChildren: function(value)
    {
        if (!value || (typeof value !== "object" && typeof value !== "function"))
            return false;

        if (value instanceof FirebugReps.ErrorCopy)
            return false;

        var enumerableOnly = Options.get("showEnumerableProperties");
        var ownOnly = Options.get("showOwnProperties");
        if (Obj.hasProperties(value, !enumerableOnly, ownOnly))
            return true;

        // Special case for "arguments", which is not enumerable by for...in statement
        // and so, Obj.hasProperties always returns false.
        // XXX(simon): This doesn't seem to be required any more (Fx28).
        if (isArguments(value) && value.length > 0)
            return true;

        if (typeof value === "function")
        {
            // Special case for functions with a prototype that has values.
            try
            {
                var proto = value.prototype;
                if (proto && Obj.hasProperties(proto, !enumerableOnly, ownOnly))
                    return true;
            }
            catch (exc) {}
        }

        // Special case for closure inspection.
        if (typeof value === "function" && this.context && this.shouldShowClosures())
        {
            try
            {
                var ret = false;
                var win = this.context.getCurrentGlobal();
                ClosureInspector.withEnvironmentForObject(win, value, this.context, function(env)
                {
                    ret = true;
                });

                if (ret)
                    return ret;
            }
            catch (e) {}
        }

        return false;
    },

    addMemberInternal: function(object, type, props, name, value, level, parentIsScope)
    {
        // Do this first in case a call to instanceof (= QI, for XPCOM things) reveals contents.
        var rep = Firebug.getRep(value);
        var tag = rep.shortTag ? rep.shortTag : rep.tag;

        var hasChildren = this.hasChildren(value);

        var descriptor = getPropertyDescriptor(object, name);
        if (!descriptor)
        {
            // xxxHonza: temporary tracing.
            TraceError.sysout("domMemberProvider.addMemberInternal; ERROR no descriptor for" +
                name, object);
        }

        var member = {
            object: object,
            name: name,
            value: value,
            type: type,
            rowClass: "memberRow-" + type,
            open: "",
            level: level,
            indent: level * 16,
            hasChildren: hasChildren,
            tag: tag,
            prefix: "",
            descriptor: descriptor,
            readOnly: (descriptor && !descriptor.writable && !descriptor.set),
            // XXX should probably move the tests from getContextMenuItems here
            deletable: (!parentIsScope && !(descriptor && !descriptor.configurable))
        };

        // The context doesn't have to be specified (e.g. in case of Watch panel that is based
        // on the same template as the DOM panel, but doesn't show any breakpoints).
        if (this.context)
        {
            // xxxHonza: Support for object change not implemented yet.
            member.breakable = !hasChildren && !parentIsScope;

            var breakpoints = this.context.dom.breakpoints;
            var bp = breakpoints.findBreakpoint(object, name);

            if (bp)
            {
                member.breakpoint = true;
                member.disabledBreakpoint = !bp.checked;
            }
        }

        if (parentIsScope)
            member.scopeNameTooltip = Locale.$STRF("dom.tip.scopeMemberName", ["%" + name]);

        // Set prefix for user defined properties. This prefix help the user to distinguish
        // among simple properties and those defined using getter and/or (only a) setter.
        // XXX This should be rewritten to use 'descriptor', and the unwrapping test is
        // always false! See issue 5377.
        /*
        if (object && !Dom.isDOMMember(object, name) && (XPCNativeWrapper.unwrap(object) !== object))
        {
            var getter = (object.__lookupGetter__) ? object.__lookupGetter__(name) : null;
            var setter = (object.__lookupSetter__) ? object.__lookupSetter__(name) : null;

            // both, getter and setter
            if (getter && setter)
                member.type = "userFunction";

            // only getter
            if (getter && !setter)
            {
                member.readOnly = true;
                member.prefix = "get";
            }

            // only setter
            if (!getter && setter)
            {
                member.prefix = "set";
            }
        }
        */

        props.push(member);
        return member;
    },

    // Add the magic "(closure)" property.
    maybeAddClosureMember: function(object, type, props, level, isScope)
    {
        var win = this.context.getCurrentGlobal();
        var wrapper = ClosureInspector.getScopeWrapper(object, win, this.context, isScope);
        if (!wrapper)
            return;

        var name = (isScope ? Locale.$STR("dom.scopeParentName") : Locale.$STR("dom.scopeName"));
        var title = (isScope ? undefined : Locale.$STR("dom.tip.scopeName"));
        var rep = Firebug.getRep(wrapper);
        var tag = rep.shortTag ? rep.shortTag : rep.tag;

        var member = {
            object: object,
            name: name,
            value: wrapper,
            type: type,
            rowClass: "memberRow-" + type,
            open: "",
            level: level,
            indent: level*16,
            hasChildren: true,
            tag: tag,
            prefix: "",
            title: title,
            readOnly: true,
            deletable: false,
            ignoredPath: true
        };
        props.push(member);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Object properties

    /**
     * Returns a list of properties available on an object, filtered on enumerability and prototype
     * chain position. Due to prototype traversal, some property names may appear several times.
     *
     * @param {Object} object The object we want to get the list of properties for.
     * @param {Boolean} enumerableOnly If set to true, only enumerable properties are returned.
     * @param {Boolean} ownOnly If set to true, only own properties (not those from the
     *      prototype chain) are returned.
     */
    getObjectProperties: function(object, enumerableOnly, ownOnly)
    {
        var props = [];

        // Get all enumerable-only or all-properties of the object (but not inherited).
        if (enumerableOnly)
            props = Object.keys(object);
        else
            props = Object.getOwnPropertyNames(object);

        // Not interested in inherited properties, bail out.
        if (ownOnly)
            return props;

        // Climb the prototype chain.
        var inheritedProps = [];
        var parent = Object.getPrototypeOf(object);
        if (parent)
            inheritedProps = this.getObjectProperties(parent, enumerableOnly, ownOnly);

        // Push everything onto the returned array, to avoid O(nm) runtime behavior.
        inheritedProps.push.apply(inheritedProps, props);
        return inheritedProps;
    },
}

// ********************************************************************************************* //
// Helpers

function isArguments(obj)
{
    return Object.prototype.toString.call(obj) === "[object Arguments]";
}

function isClassFunction(fn)
{
    try
    {
        for (var name in fn.prototype)
            return true;
    }
    catch (exc)
    {
    }

    return false;
}

function isPrototype(name)
{
    return (name === "prototype" || name === "__proto__");
}

function getPropertyDescriptor(object, propName)
{
    try
    {
        var desc;
        while (object)
        {
            desc = Object.getOwnPropertyDescriptor(object, propName);
            if (desc)
                return desc;
            object = Object.getPrototypeOf(object);
        }
    }
    catch (e)
    {
    }
    return undefined;
}

// ********************************************************************************************* //
// Registration

return DOMMemberProvider;

// ********************************************************************************************* //
});
