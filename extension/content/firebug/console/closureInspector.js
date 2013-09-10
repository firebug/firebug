/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false */
/*global FBTrace:true, Components:true, Proxy:true, define:true */

// A note on terminology: here a "closure"/"environment" is generally thought
// of as a container of "scopes".

define([
    "firebug/firebug",
    "firebug/lib/wrapper",
    "firebug/debugger/debuggerLib",
    "firebug/console/commandLineExposed",
],
function(Firebug, Wrapper, DebuggerLib, CommandLineExposed) {
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
    getVariableOrOptimizedAway: function(scope, name)
    {
        try
        {
            var ret = scope.getVariable(name);
            if (ret !== undefined)
                return ret;

            if (scope.type === "declarative")
            {
                // The variable is either optimized away or actually set to
                // undefined. Optimized-away ones are apparently not settable,
                // so try to detect them by that (it seems rather safe).
                scope.setVariable(name, 0);
                if (scope.getVariable(name) === undefined)
                    return OptimizedAway;
                scope.setVariable(name, undefined);
            }

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

            for (var i = 0; i < names.length; ++i)
            {
                // We assume that the first own property, or the first
                // enumerable property of the prototype (or "constructor"),
                // that is a function with some scope (i.e., it is interpreted,
                // JSScript-backed, and without optimized-away scope) shares
                // this scope with 'obj'.
                // (Since, in the current implementation, Firefox seems to give
                // all functions in a particular scope (except self-contained
                // ones) the same environment, the first is as good as any,
                // and it's probably near the definition of 'obj').

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
        if (!obj || !(typeof obj === "object" || typeof obj === "function"))
            throw new TypeError("can't get scope of non-object");

        var objGlobal = Cu.getGlobalForObject(obj);
        if (win !== objGlobal && !(win.document && objGlobal.document &&
            win.document.nodePrincipal.subsumes(objGlobal.document.nodePrincipal)))
        {
            throw new Error("permission denied to access cross origin scope");
        }

        // Create a view of the object as seen from its own global - 'environment'
        // will not be accessible otherwise.
        var dglobal = DebuggerLib.getDebuggeeGlobal(context, objGlobal);

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
        var win = context.getCurrentGlobal();
        if (obj === win || obj === win.document)
            return ret;

        try
        {
            var env = this.getEnvironmentForObject(win, obj, context);
            for (var scope = env; scope; scope = scope.parent)
            {
                if (!this.isScopeInteresting(scope))
                    break;

                // Probably the scope of the bindings for our (or Mozilla's) Command
                // Line API, which is at the top of the scope chain on objects defined
                // through the console. Hide it for a nicer display.
                if (scope.type === "object" && !this.isScopeInteresting(scope.parent) &&
                    scope.getVariable("cd") && scope.getVariable("inspect"))
                {
                    break;
                }

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
        var env, dglobal;
        env = this.getEnvironmentForObject(win, obj, context);

        dglobal = DebuggerLib.getDebuggeeGlobal(context, win);

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
                        return DebuggerLib.unwrapDebuggeeValue(dval);
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
        handler.delete = function(name)
        {
            throw new Error("can't delete closure variable");
        };
        // Other traps are syntactically inaccessible, so we don't need to implement them.
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

        var dwin = DebuggerLib.getDebuggeeGlobal(context, win);

        var scopeDataHolder = Object.create(ScopeProxy.prototype);
        scopeDataHolder.scope = scope;

        var self = this;
        var names, namesSet;
        var lazyCreateNames = function()
        {
            lazyCreateNames = function() {};
            names = scope.names();

            // Due to weird Firefox behavior, we sometimes have to skip over duplicate
            // scopes (see issue 6184).
            if (names.length === 1 && scope.type === "declarative" &&
                scope.parent && scope.parent.type === "declarative")
            {
                var par = scope.parent, parNames = par.names();
                if (parNames.length === 1 && parNames[0] === names[0])
                    scopeDataHolder.scope = scope = par;
            }

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
                        return DebuggerLib.unwrapDebuggeeValue(dval);
                    },
                    set: (dval === OptimizedAway ? undefined : function(value) {
                        dval = dwin.makeDebuggeeValue(value);
                        scope.setVariable(name, dval);
                    }),
                    enumerable: true,
                    configurable: false
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

    getScopeFromWrapper: function(obj)
    {
        return Object.getPrototypeOf(obj).scope;
    },

    extendLanguageSyntax: function(expr, win, context)
    {
        // Temporary FireClosure compatibility.
        if (Firebug.JSAutoCompleter.transformScopeExpr)
            return expr;

        // Note: this is also hard-coded elsewhere.
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
