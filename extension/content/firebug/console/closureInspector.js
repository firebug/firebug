/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false */
/*global FBTrace:true, Components:true, Proxy:true, define:true */

// A note on terminology: here a "closure"/"environment" is generally thought
// of as a container of "scopes".

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/wrapper"
],
function(Obj, Firebug, Wrapper) {
"use strict";

// ********************************************************************************************* //
// Constants

const Cu = Components.utils;

const ScopeProxy = function() {};
const OptimizedAway = Object.create(null);
Object.freeze(OptimizedAway);

// ********************************************************************************************* //

var ClosureInspector =
{
    hasInit: false,
    Debugger: null,

    getInactiveDebuggerForContext: function(context)
    {
        if (context.inactiveDebugger)
            return context.inactiveDebugger;

        if (!this.hasInit)
        {
            this.hasInit = true;
            try
            {
                Cu.import("resource://gre/modules/jsdebugger.jsm");
                window.addDebuggerToGlobal(window);
                this.Debugger = window.Debugger;
            }
            catch (exc)
            {
                if (FBTrace.DBG_COMMANDLINE)
                    FBTrace.sysout("ClosureInspector; Debugger not found", exc);
            }
        }
        if (!this.Debugger)
            return;

        var dbg = new this.Debugger();
        dbg.enabled = false;
        context.inactiveDebugger = dbg;
        return dbg;
    },

    getVariableOrOptimizedAway: function(scope, name)
    {
        try
        {
            var ret = scope.getVariable(name);
            if (ret !== undefined)
                return ret;

            // The variable is either optimized away or actually set to undefined.
            // Optimized-away ones are apparantly not settable, so try to detect
            // them by that (it seems rather safe).
            scope.setVariable(name, 0);
            if (scope.getVariable(name) === undefined)
                return OptimizedAway;
            scope.setVariable(name, undefined);
            return undefined;
        }
        catch (exc)
        {
            // E.g. optimized-away "arguments" can throw "Debugger scope is not live".
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; getVariableOrOptimizedAway caught an exception", exc);
            return OptimizedAway;
        }
    },

    isOptimizedAway: function(obj)
    {
        return obj === OptimizedAway;
    },

    isSimple: function(dobj)
    {
        return (typeof dobj !== "object" || dobj === OptimizedAway);
    },

    unwrap: function(global, dglobal, obj)
    {
        dglobal.defineProperty("_firebugUnwrappedDebuggerObject", {
            value: obj,
            writable: true,
            configurable: true
        });
        return global._firebugUnwrappedDebuggerObject;
    },

    isScopeInteresting: function(scope)
    {
        return !!scope.parent;
    },

    getFunctionFromObject: function(obj)
    {
        var first = true;
        while (obj)
        {
            var names = obj.getOwnPropertyNames(), pd;

            // "constructor" is boring, use it last
            var ind = names.indexOf("constructor");
            if (ind !== -1)
            {
                names.splice(ind, 1);
                names.push("constructor");
            }

            // XXX keep a Map of scopes, and take the highest container of the first one or the (first) deepest one or something
            for (var i = 0; i < names.length; ++i)
            {
                // We assume that the first own property, or the first
                // enumerable property of the prototype (or "constructor"),
                // that is a function with some scope (i.e., it is interpreted,
                // JSScript-backed, and without optimized-away scope) shares
                // this scope with 'obj'.

                var name = names[i];
                try
                {
                    pd = obj.getOwnPropertyDescriptor(name);
                }
                catch (e)
                {
                    // getOwnPropertyDescriptor sometimes fails with
                    // "Illegal operation on WrappedNative prototype object",
                    // for instance on [window].proto.gopd("localStorage").
                    continue;
                }
                if (!pd || (!first && !pd.enumerable && name !== "constructor"))
                    continue;

                var toTest = [pd.get, pd.set, pd.value];
                for (var j = 0; j < toTest.length; ++j)
                {
                    var f = toTest[j];
                    if (f && f.environment && this.isScopeInteresting(f.environment))
                        return f;
                }
            }

            if (!first)
                break;
            first = false;
            obj = obj.proto;
        }

        // None found. :(
        return undefined;
    },

    // Within the security context of the (wrapped) window 'win', find a relevant
    // closure for the content object 'obj' (may be from another frame).
    // Throws exceptions on error.
    getEnvironmentForObject: function(win, obj, context)
    {
        var dbg = this.getInactiveDebuggerForContext(context);
        if (!dbg)
            throw new Error("debugger not available");

        if (!obj || !(typeof obj === "object" || typeof obj === "function"))
            throw new TypeError("can't get scope of non-object");

        var objGlobal = Cu.getGlobalForObject(obj);
        if (win !== objGlobal && !(win.document && objGlobal.document &&
            win.document.nodePrincipal.subsumes(objGlobal.document.nodePrincipal)))
        {
            throw new Error("permission denied to access cross origin scope");
        }

        var dglobal = dbg.addDebuggee(objGlobal);

        var dobj = dglobal.makeDebuggeeValue(obj);

        if (typeof obj === "object")
            dobj = this.getFunctionFromObject(dobj);

        if (!dobj || !dobj.environment || !this.isScopeInteresting(dobj.environment))
            throw new Error("missing closure");

        return dobj.environment;
    },

    getClosureVariablesList: function(obj, context)
    {
        var ret = [];

        // Avoid 'window' and 'document' getting associated with closures.
        var win = context.baseWindow || context.window;
        if (obj === win || obj === win.document)
            return ret;

        try
        {
            var env = this.getEnvironmentForObject(win, obj, context);
            for (var scope = env; scope; scope = scope.parent)
            {
                if (scope.type === "with" && scope.getVariable("profileEnd"))
                {
                    // Almost certainly the with(_FirebugCommandLine) block,
                    // which is at the top of the scope chain on objects
                    // defined through the console. Hide it for a nicer display.
                    break;
                }
                if (!this.isScopeInteresting(scope))
                    break;

                ret.push.apply(ret, scope.names());
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; getClosureVariablesList failed", exc);
        }
        return ret;
    },

    getClosureWrapper: function(obj, win, context)
    {
        var env = this.getEnvironmentForObject(win, obj, context);

        var dbg = this.getInactiveDebuggerForContext(context);
        var dglobal = dbg.addDebuggee(win);

        // Return a wrapper for its scoped variables.
        var self = this;
        var handler = {};
        handler.getOwnPropertyDescriptor = function(name)
        {
            if (name === "__exposedProps__")
            {
                // Expose mostly everything, rw, through another proxy.
                return {
                    value: Proxy.create({
                        getPropertyDescriptor: function(name)
                        {
                            if (name === "__exposedProps__" || name === "__proto__")
                                return;
                            return {value: "rw", enumerable: true};
                        }
                    })
                };
            }

            return {
                get: function()
                {
                    try
                    {
                        var scope = env.find(name);
                        if (!scope)
                            return undefined;
                        var dval = self.getVariableOrOptimizedAway(scope, name);
                        if (self.isSimple(dval))
                            return dval;
                        var uwWin = Wrapper.getContentView(win);
                        return self.unwrap(uwWin, dglobal, dval);
                    }
                    catch (exc)
                    {
                        if (FBTrace.DBG_COMMANDLINE)
                            FBTrace.sysout("ClosureInspector; failed to return value from getter", exc);
                        return undefined;
                    }
                },

                set: function(value)
                {
                    var dvalue = dglobal.makeDebuggeeValue(value);
                    var scope = env.find(name);
                    if (!scope)
                        throw new Error("can't create new closure variable");
                    if (self.getVariableOrOptimizedAway(scope, name) === OptimizedAway)
                        throw new Error("can't set optimized-away closure variable");
                    scope.setVariable(name, dvalue);
                }
            };
        };
        handler.getPropertyDescriptor = handler.getOwnPropertyDescriptor;
        return Proxy.create(handler);
    },

    getScopeWrapper: function(obj, win, context, isScope)
    {
        var scope;
        try
        {
            if (isScope)
                scope = Object.getPrototypeOf(obj).scope.parent;
            else
                scope = this.getEnvironmentForObject(win, obj, context);
            if (!scope || !this.isScopeInteresting(scope))
                return;
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; getScopeWrapper failed", exc);
            return;
        }

        var dbg = this.getInactiveDebuggerForContext(context);
        var dwin = dbg.addDebuggee(win);

        var scopeDataHolder = Object.create(ScopeProxy.prototype);
        scopeDataHolder.scope = scope;

        var self = this;
        var names, namesSet;
        var lazyCreateNames = function()
        {
            lazyCreateNames = function() {};
            names = scope.names();

            // "arguments" is almost always present and optimized away, so hide it
            // for a nicer display.
            var ind = names.indexOf("arguments");
            if (ind !== -1 && self.getVariableOrOptimizedAway(scope, "arguments") === OptimizedAway)
                names.splice(ind, 1);

            namesSet = new Set();
            for (var i = 0; i < names.length; ++i)
                namesSet.add(names[i]);
        };

        return Proxy.create({
            desc: function(name)
            {
                if (!this.has(name))
                    return;
                var dval = self.getVariableOrOptimizedAway(scope, name);
                return {
                    get: function() {
                        if (self.isSimple(dval))
                            return dval;
                        var uwWin = Wrapper.getContentView(win);
                        return self.unwrap(uwWin, dwin, dval);
                    },
                    set: (dval === OptimizedAway ? undefined : function(value) {
                        dval = dwin.makeDebuggeeValue(value);
                        scope.setVariable(name, dval);
                    })
                };
            },
            has: function(name)
            {
                lazyCreateNames();
                return namesSet.has(name);
            },
            hasOwn: function(name) { return this.has(name); },
            getOwnPropertyDescriptor: function(name) { return this.desc(name); },
            getPropertyDescriptor: function(name) { return this.desc(name); },
            keys: function()
            {
                lazyCreateNames();
                return names;
            },
            enumerate: function() { return this.keys(); },
            getOwnPropertyNames: function() { return this.keys(); },
            getPropertyNames: function() { return this.keys(); }
        }, scopeDataHolder);
    },

    isScopeWrapper: function(obj)
    {
        return obj instanceof ScopeProxy;
    },

    extendLanguageSyntax: function(expr, win, context)
    {
        // Temporary FireClosure compatibility.
        if (Firebug.JSAutoCompleter.transformScopeExpr)
            return expr;

        var fname = "__fb_scopedVars";

        var newExpr = Firebug.JSAutoCompleter.transformScopeOperator(expr, fname);
        if (expr === newExpr)
            return expr;

        if (FBTrace.DBG_COMMANDLINE)
        {
            FBTrace.sysout("ClosureInspector; transforming expression: `" +
                    expr + "` -> `" + newExpr + "`");
        }

        // Stick the helper function for .%-expressions on the window object.
        // This really belongs on the command line object, but that doesn't
        // work when stopped in the debugger (issue 5321, which depends on
        // integrating JSD2) and we really need this to work there.
        // To avoid leaking capabilities into arbitrary web pages, this is
        // only injected when needed.
        try
        {
            var self = this;
            Object.defineProperty(Wrapper.getContentView(win), fname, {
                value: function(obj)
                {
                    return self.getClosureWrapper(obj, win, context);
                },
                writable: true,
                configurable: true
            });
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; failed to inject " + fname, exc);
        }

        return newExpr;
    }
};

Firebug.ClosureInspector = ClosureInspector;
return ClosureInspector;

// ********************************************************************************************* //
});
