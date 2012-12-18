/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false */
/*global FBTrace:true, Components:true, Proxy:true, define:true */

// A note on terminology: here a "closure" is generally thought of as a container of "scopes".

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/wrapper"
],
function(Obj, Firebug, Wrapper) {
"use strict";

// ********************************************************************************************* //
// Constants

const Ci = Components.interfaces;
const Cu = Components.utils;

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

    getVariableOrOptimizedAway: function(env, name)
    {
        try
        {
            var ret = env.getVariable(name);
            if (ret !== undefined)
                return ret;

            // The variable is either optimized away or actually set to undefined.
            // Optimized-away ones are apparantly not settable, so try to detect
            // them by that (it seems rather safe).
            env.setVariable(name, 0);
            if (env.getVariable(name) === undefined)
                return OptimizedAway;
            env.setVariable(name, undefined);
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

    scopeIsInteresting: function(env)
    {
        return !!env.parent;
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
                    if (f && f.environment && this.scopeIsInteresting(f.environment))
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

    getVariableFromClosureRaw: function(env, mem)
    {
        try
        {
            env = env.find(mem);
            if (env)
                return this.getVariableOrOptimizedAway(env, mem);
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; getVariableFromClosureRaw didn't find anything");
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; getVariableFromClosureRaw failed", exc);
        }

        // Nothing found, for whatever reason.
        return undefined;
    },

    setScopedVariableRaw: function(env, mem, to)
    {
        try
        {
            env = env.find(mem);
            if (env)
            {
                env.setVariable(mem, to);
                return;
            }
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; setScopedVariableRaw didn't find anything");
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; setScopedVariableRaw failed", exc);
            throw exc;
        }
        throw new Error("can't create new closure variables");
    },

    getClosureVariablesListRaw: function(env)
    {
        var ret = [];
        try
        {
            while (env)
            {
                if (env.type === "with" && env.getVariable("profileEnd"))
                {
                    // Almost certainly the with(_FirebugCommandLine) block,
                    // which is at the top of the scope chain on objects
                    // defined through the console. Hide it for a nicer display.
                    break;
                }
                if (!this.scopeIsInteresting(env))
                    break;

                ret.push.apply(ret, env.names());
                env = env.parent;
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; getScopedVariablesRaw failed", exc);
        }
        return ret;
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

        if (!dobj || !dobj.environment || !this.scopeIsInteresting(dobj.environment))
            throw new Error("missing closure");

        return dobj.environment;
    },

    getClosureVariablesList: function(obj, context)
    {
        // Avoid 'window' and 'document' getting associated with closures.
        var win = context.baseWindow || context.window;
        if (obj === win || obj === win.document)
            return [];

        try
        {
            var env = this.getEnvironmentForObject(win, obj, context);
            return this.getClosureVariablesListRaw(env);
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; getClosureVariablesList failed", exc);
            return [];
        }
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
                        var dval = self.getVariableFromClosureRaw(env, name);
                        if (self.isSimple(dval))
                            return dval;
                        var uwWin = Wrapper.getContentView(win);
                        return self.unwrap(uwWin, dglobal, dval);
                    }
                    catch (exc)
                    {
                        if (FBTrace.DBG_COMMANDLINE)
                            FBTrace.sysout("ClosureInspector; failed to return value from getter", exc);
                    }
                },

                set: function(value)
                {
                    value = dglobal.makeDebuggeeValue(value);
                    self.setScopedVariableRaw(env, name, value);
                }
            };
        };
        handler.getPropertyDescriptor = handler.getOwnPropertyDescriptor;
        return Proxy.create(handler);
    },

    extendLanguageSyntax: function (expr, win, context)
    {
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

return ClosureInspector;

// ********************************************************************************************* //
});
