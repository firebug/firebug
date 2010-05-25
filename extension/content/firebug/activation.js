/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch2);

const detachCommand = $("cmd_toggleDetachFirebug");

// The service doesn't have to be available if Firefox is built with privatebrowsing disabled so,
// don't foreget to check it before access (issue 2923).
const privateBrowsingEnabled = ("@mozilla.org/privatebrowsing;1" in Cc) &&
    Cc["@mozilla.org/privatebrowsing;1"].getService(Ci.nsIPrivateBrowsingService).privateBrowsingEnabled;

// ************************************************************************************************

/**
 * @class Implements Firebug activation logic.
 *
 * 1) Part of the logic is based on annotation service (see components/firebug-annotations.js)
 *    in order to remember whether Firebug is activated for given site or not.
 *    If there is "firebugged.showFirebug" annotation for a given site Firbug is activated.
 *    If there is "firebugged.closed" annotation for a given site Firbug is not activated.
 *
 * 2) Other part is based on extensions.firebug.allPagesActivation option. This option
 *    can be set to the following values:
 *    none: The option isn't used (default value)
 *    on:   Firebug is activated for all URLs.
 *    off:  Firebug is never activated.
 *
 *    This logic has higher priority over the URL annotations.
 *    If "off" options is selected, all existing URL annotations are removed.
 */
Firebug.Activation = extend(Firebug.Module,
{
    dispatchName: "activation",

    initializeUI: function()  // called once
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        TabWatcher.addListener(this.TabWatcherListener);

        // The "off" option is removed so make sure to convert previsous prev value
        // into "none" if necessary.
        if (Firebug.allPagesActivation == "off")
            Firebug.allPagesActivation = "none";

        // Update option menu item.
        this.updateAllPagesActivation();
    },

    getAnnotationService: function()
    {
        if(!this.annotationSvc)
        {
            // Create annotation service.
            this.annotationSvc = Cc["@joehewitt.com/firebug-annotation-service;1"]
                .getService(Ci.nsISupports).wrappedJSObject;
        }
        return this.annotationSvc;
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        TabWatcher.removeListener(this.TabWatcherListener);

        this.getAnnotationService().flush();
    },

    convertToURIKey: function(url, sameOrigin)  // process the URL to canonicalize it. Need not be reversible.
    {
        var uri = makeURI(normalizeURL(url));

        if (Firebug.filterSystemURLs && isSystemURL(url))
            return uri;

        if (url == "about:blank")  // avoid exceptions.
            return uri;

        if (uri && sameOrigin)
        {
            try
            {
                var prePath = uri.prePath; // returns the string before the path (such as "scheme://user:password@host:port").
                var shortURI = makeURI(prePath);
                if (!shortURI)
                    return uri;

                if (shortURI.scheme === "about")  // annoying "about" URIs throw if you access .host
                    return shortURI;

                var host = shortURI.host;
                if (host)
                {
                    var crossDomain = host.split('.').slice(-2)
                    shortURI.host = crossDomain.join('.');
                    return shortURI
                }
            }
            catch (exc)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("activation.convertToURIKey returning full URI, activateSameOrigin FAILS for shortURI "+shortURI+" because: "+exc, exc);
                return uri;
            }
        }
        return uri;
    },

    shouldCreateContext: function(browser, url, userCommands)  // true if the Places annotation the URI "firebugged"
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("shouldCreateContext allPagesActivation " + Firebug.allPagesActivation);

        if (Firebug.allPagesActivation == "on")
            return true;

        if (Firebug.filterSystemURLs && isSystemURL(url)) // if about:blank gets thru, 1483 fails
            return false;

        if (userCommands)
            return true;

        if (browser.showFirebug && url.substr(0, 8) === "wyciwyg:")  // document.open on a firebugged page
            return true;

        try
        {
            var uri = this.convertToURIKey(url, Firebug.activateSameOrigin);
            if (!uri)
                return false;

            var hasAnnotation = this.getAnnotationService().pageHasAnnotation(uri);

            if (FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("shouldCreateContext hasAnnotation "+hasAnnotation +
                    " for "+uri.spec+" in "+browser.contentWindow.location +
                    " using activateSameOrigin: "+Firebug.activateSameOrigin);

            // Annotated so, return the value.
            if (hasAnnotation)
                return this.checkAnnotation(browser, uri);

            if (browser.FirebugLink) // then TabWatcher found a connection
            {
                var dst = browser.FirebugLink.dst;
                var dstURI = this.convertToURIKey(dst.spec, Firebug.activateSameOrigin);
                if (FBTrace.DBG_ACTIVATION)
                    FBTrace.sysout("shouldCreateContext found FirebugLink pointing to " +
                        dstURI.spec, browser.FirebugLink);

                if (dstURI && dstURI.equals(uri)) // and it matches us now
                {
                    var srcURI = this.convertToURIKey(browser.FirebugLink.src.spec, Firebug.activateSameOrigin);
                    if (srcURI)
                    {
                        if (FBTrace.DBG_ACTIVATION)
                            FBTrace.sysout("shouldCreateContext found FirebugLink pointing from " +
                                srcURI.spec, browser.FirebugLink);

                        if (srcURI.schemeIs("file") || (dstURI.host == srcURI.host) ) // and it's on the same domain
                        {
                            hasAnnotation = this.getAnnotationService().pageHasAnnotation(srcURI);
                            if (hasAnnotation) // and the source page was annotated.
                            {
                                var srcShow = this.checkAnnotation(browser, srcURI);
                                if (srcShow)  // and the source annotation said show it
                                    this.watchBrowser(browser);  // so we show dst as well.
                                return srcShow;
                            }
                        }
                    }
                }
                else
                {
                    if (FBTrace.DBG_ACTIVATION)
                        FBTrace.sysout("shouldCreateContext FirebugLink does not match "+uri.spec, browser.FirebugLink);
                }
            }
            else if (browser.contentWindow.opener)
            {
                var openerContext = TabWatcher.getContextByWindow(browser.contentWindow.opener);

                if (FBTrace.DBG_ACTIVATION)
                    FBTrace.sysout("shouldCreateContext opener found, has "+
                        (openerContext?"a ":"no ")+" context: "+
                        browser.contentWindow.opener.location);

                if (openerContext)
                    return true;  // popup windows of Firebugged windows are Firebugged
            }

            return false;   // don't createContext
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("pageHasAnnoation FAILS for url: "+url+" which gave uri "+(uri?uri.spec:"null"), exc);
        }
    },

    checkAnnotation: function(browser, uri)
    {
        var annotation = this.getAnnotationService().getPageAnnotation(uri);

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("shouldCreateContext read back annotation "+annotation+" for uri "+uri.spec);

        // then the user closed Firebug on this page last time
        if ((Firebug.allPagesActivation != "on") && (annotation.indexOf("closed") > 0))
            return false; // annotated as 'closed', don't create
        else
            return true;    // annotated, createContext
    },

    shouldShowContext: function(context)
    {
        return this.shouldCreateContext(context.browser, context.getWindowLocation().toString());
    },

    watchBrowser: function(browser)  // Firebug is opened in browser
    {
        var annotation = "firebugged.showFirebug";
        this.setPageAnnotation(browser.currentURI.spec, annotation);
    },

    unwatchBrowser: function(browser, userCommands)  // Firebug closes in browser
    {
        var uri = browser.currentURI.spec;
        if (userCommands)  // then mark to not open virally.
            this.setPageAnnotation(uri, "firebugged.closed");
        else
            this.removePageAnnotation(uri); // unmark this URI
    },

    clearAnnotations: function()
    {
        this.getAnnotationService().clear();
    },

    setPageAnnotation: function(currentURI, annotation)
    {
        if (privateBrowsingEnabled)
        {
            Firebug.Console.logFormatted(["Sites are not remembered in Private Browsing Mode"], FirebugContext, "info");  // XXXTODO NLS
            return;
        }

        var uri = this.convertToURIKey(currentURI, Firebug.activateSameOrigin);
        if (uri)
            this.getAnnotationService().setPageAnnotation(uri, annotation);

        if (Firebug.activateSameOrigin)
        {
            uri = this.convertToURIKey(currentURI, false);
            if (uri)
                this.getAnnotationService().setPageAnnotation(uri, annotation);
        }
    },

    removePageAnnotation: function(currentURI)
    {
        var uri = this.convertToURIKey(currentURI, Firebug.activateSameOrigin);
        if (uri)
            this.getAnnotationService().removePageAnnotation(uri);

        if (Firebug.activateSameOrigin)
        {
            uri = this.convertToURIKey(currentURI, false);
            if (uri)
                this.getAnnotationService().removePageAnnotation(uri);
        }

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.Activation.unwatchBrowser untagged "+uri.spec);
    },

    iterateAnnotations: function(fn)  // stops at the first fn(uri) that returns a true value
    {
        var annotations = this.getAnnotationService().getAnnotations(this.annotationName);
        for (var uri in annotations)
        {
            var rc = fn(uri, annotations[uri]);
            if (rc)
                return rc;
        }
    },

    toggleAll: function(state)
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.toggleAll("+state+") with allPagesActivation: " +
                Firebug.allPagesActivation);

        if (state == "on")
        {
            if (Firebug.allPagesActivation == state) // then we were armed
                Firebug.allPagesActivation = "none";
            else
                this.allOn();
        }
        else
        {
            Firebug.allPagesActivation = "none";
        }

        Firebug.setPref(Firebug.prefDomain, "allPagesActivation", Firebug.allPagesActivation);
        this.updateAllPagesActivation();
    },

    updateOption: function(name, value)
    {
        if (name = "allPagesActivation")
            this.updateAllPagesActivation();
    },

    updateAllPagesActivation: function()
    {
        var allOn = Firebug.allPagesActivation == "on";

        var menu = $('menu_AllOn');
        if (menu)
            menu.setAttribute("checked", allOn);

        // don't show Off button if we are always on
        Firebug.chrome.disableOff(allOn);
    },

    allOn: function()
    {
        Firebug.allPagesActivation = "on";  // In future we always create contexts,
        Firebug.toggleBar(true);  // and we turn on for the current page
    }
});

// ************************************************************************************************

Firebug.Activation.TabWatcherListener =
{
    watchBrowser: function(browser)
    {
        Firebug.Activation.watchBrowser(browser);
    },

    unwatchBrowser: function(browser, userCommands)
    {
        Firebug.Activation.unwatchBrowser(browser, userCommands);
    }
};

// ************************************************************************************************

Firebug.PanelActivation = extend(Firebug.Module,
{
    initialize: function()
    {
        prefs.addObserver(Firebug.prefDomain, this, false);
    },

    shutdown: function()
    {
        prefs.removeObserver(Firebug.prefDomain, this, false);
    },

    // Enable & disable methods (used e.g. by Options Mini Menu and Firebug status bar menu).
    enablePanel: function(panel)
    {
        if (panel && panel.activable)
            this.setDefaultState(panel.name, true);
    },

    disablePanel: function(panel)
    {
        if (panel && panel.activable)
            this.setDefaultState(panel.name, false);
    },

    enableAllPanels: function()
    {
        for (var i = 0; i < Firebug.panelTypes.length; ++i)
        {
            var panelType = Firebug.panelTypes[i];
            if (panelType.prototype.activable)
                this.setDefaultState(panelType.prototype.name, true);
        }
    },

    disableAllPanels: function()
    {
        for (var i = 0; i < Firebug.panelTypes.length; ++i)
        {
            var panelType = Firebug.panelTypes[i];
            if (panelType.prototype.activable)
                this.setDefaultState(panelType.prototype.name, false);
        }
    },

    setDefaultState: function(panelName, enable)
    {
        if (!panelName)
            return;

        var prefDomain = Firebug.prefDomain + "." + panelName;

        // Proper activation preference must be available.
        var type = prefs.getPrefType(prefDomain + ".enableSites")
        if (type != Ci.nsIPrefBranch.PREF_BOOL)
            return;

        Firebug.setPref(prefDomain, "enableSites", enable);
    },

    /**
     * Observer for activation preferences changes.
     */
    observe: function(subject, topic, data)
    {
        if (topic != "nsPref:changed")
            return;

        if (data.indexOf(".enableSites") == -1)
            return;

        var parts = data.split(".");
        if (parts.length != 4)
            return;

        try
        {
            var panelName = parts[2];
            var enable = Firebug.getPref(Firebug.prefDomain, panelName + ".enableSites");

            this.onChangeActivation(panelName, enable);
        }
        catch (e)
        {
            if (FBTrace.DBG_ACTIVATION || FBTrace.DBG_ERRORS)
                FBTrace.sysout("PanelActivation.observe; EXCEPTION " + e, e);
        }
    },

    onChangeActivation: function(panelName, enable)
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("PanelActivation.changeActivation; The '" + panelName +
                "' panel is now " + (enable ? "enabled" : "disabled"));

        if (enable)
            dispatch(Firebug.modules, "onPanelEnable", [panelName]);
        else
            dispatch(Firebug.modules, "onPanelDisable", [panelName]);

        // Update UI
        this.updateTab(panelName, enable);
        Firebug.resetTooltip();

        // Iterate all contexts and change panel activation for all
        // panels with this name.
        var self = this;
        TabWatcher.iterateContexts(function(context) {
            self.changeActivation(context, panelName, enable);
        });
    },

    changeActivation: function(context, panelName, enable)
    {
        try
        {
            var panel = context.getPanel(panelName, false);
            if (!panel)
                return;

            // Enable or disable panel within the specified context.
            if (enable)
                panel.enablePanel();
            else
                panel.disablePanel();

            // Another notification for all modules, now with the context.
            var fName = enable ? "onEnabled" : "onDisabled";
            dispatch(Firebug.modules, fName, [context, panelName]);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("PanelActivation.onChangeActivation FAILS for " +
                    context.getName() + " because: " + exc, exc);
        }
    },

    updateTab: function(panelName, enable)
    {
        // Set activable module to mini tab menu so, the menu can get the actual state.
        var panelBar = Firebug.chrome.$("fbPanelBar1");
        var tab = panelBar.getTab(panelName);
        if (!tab)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("PanelActivation.updateTab; No tab: " + panelName);
            return;
        }

        //xxxHonza: the tab needs to know wheter to show enablement actions or not.
        //tab.setModule(this);

        if (enable)
            tab.setAttribute("aria-disabled", "false");
        else
            tab.setAttribute("aria-disabled", "true");
    },
});

// ************************************************************************************************

Firebug.DisabledPanelPage = domplate(Firebug.Rep,
{
    tag:
        DIV({"class": "disabledPanelBox"},
            H1({"class": "disabledPanelHead"},
                SPAN("$pageTitle")
            ),
            P({"class": "disabledPanelDescription", style: "margin-top: 15px;"},
                $STR("moduleManager.desc3"),
                SPAN("&nbsp;"),
                SPAN({"class": "descImage descImage-$panelName"})
            )
            /* need something here that pushes down any thing appended to the panel */
         ),

    show: function(panel)
    {
        // Always render the page so, the previous content is properly replaced.
        //if (!panel.disabledBox)
            this.render(panel);

        panel.disabledBox.setAttribute("collapsed", false);
        panel.panelNode.scrollTop = 0;

        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.DisabledPanelPage.show:"+panel.disabledBox.getAttribute('collapsed')+" box", panel.disabledBox);
    },

    hide: function(panel)
    {
        if (!panel.disabledBox)
            return;

        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.DisabledPanelPage.hide; box", panel.disabledBox);

        panel.disabledBox.setAttribute("collapsed", true);
    },

    render: function(panel)
    {
        // Prepare arguments for the template.
        var args = {
            pageTitle: $STRF("moduleManager.title", [panel.name]),
            panelName: panel.name
        };

        // Render panel HTML
        panel.disabledBox = this.tag.replace(args, panel.panelNode, this);
        panel.panelNode.scrollTop = 0;
    }
});

// ************************************************************************************************

Firebug.registerModule(Firebug.Activation);
Firebug.registerModule(Firebug.PanelActivation);

// ************************************************************************************************
}});
