/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Backward compatibility with Extensions

// xxxHonza: the only global should be Firebug object, but extensions use FBL
// to register namespaces (and bindings.xml uses it too). So, FBL must be
// available before extension's scripts are loaded.
window.FBL =
{
    namespaces: [],

    ns: function(fn)
    {
        var ns = {};
        this.namespaces.push(fn, ns);
        return ns;
    },

    initialize: function()
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("FBL.initialize BEGIN "+FBL.namespaces.length+" namespaces\n");

        for (var i=0; i<FBL.namespaces.length; i+=2)
        {
            var fn = FBL.namespaces[i];
            var ns = FBL.namespaces[i+1];

            try
            {
                fn.apply(ns);
            }
            catch (exc)
            {
                FBTrace.sysout("fbl.initialize; EXCEPTION " + exc, exc);

                if (exc.stack)
                    Components.utils.reportError("Firebug initialize FAILS "+exc+" "+exc.stack);
                else
                Components.utils.reportError("Firebug initialize FAILS "+exc+" "+
                        fn.toSource().substr(0,500));
            }
        }

        if (FBTrace.DBG_INITIALIZE)
        {
            FBTrace.sysout("FBL.initialize END " + FBL.namespaces.length + " namespaces");
            FBTrace.sysout("Modules: " + Firebug.modules.length);
            FBTrace.sysout("Panel types: " + Firebug.earlyRegPanelTypes.length);
        }
    }
}

// ********************************************************************************************* //
