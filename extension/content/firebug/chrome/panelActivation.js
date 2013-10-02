/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/firefox",
    "firebug/lib/locale",
    "firebug/lib/domplate",
    "firebug/lib/xpcom",
    "firebug/lib/url",
    "firebug/lib/dom",
    "firebug/lib/options",
],
function(Obj, Firebug, Firefox, Locale, Domplate, Xpcom, Url, Dom, Options) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var prefs = Xpcom.CCSV("@mozilla.org/preferences-service;1", "nsIPrefBranch");
var prompts = Xpcom.CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");

var {domplate, DIV, H1, SPAN, P, A} = Domplate;

// ********************************************************************************************* //
// Panel Activation Implementation

/**
 * @module Implements Panel activation logic. A Firebug panel can support activation in order
 * to avoid performance penalties in cases when panel's features are not necessary at the moment.
 * Such panel must be derived from {@link Firebug.ActivablePanel} and appropriate activable
 * module from {@link Firebug.ActivableModule}
 */
Firebug.PanelActivation = Obj.extend(Firebug.Module,
/** @lends Firebug.PanelActivation */
{
    dispatchName: "panelActivation",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    initialize: function()
    {
        prefs.addObserver(Options.getPrefDomain(), this, false);
        Firebug.connection.addListener(this);
    },

    initializeUI: function()
    {
        // The "off" option is removed so make sure to convert previous value
        // into "none" if necessary.
        if (Firebug.allPagesActivation == "off")
            Firebug.allPagesActivation = "none";

        // Update option menu item.
        this.updateAllPagesActivation();
    },

    shutdown: function()
    {
        prefs.removeObserver(Options.getPrefDomain(), this, false);
        Firebug.connection.removeListener(this);
    },

    showPanel: function(browser, panel)
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("PanelActivation.showPanel; " + (panel ? panel.name : "null panel"));

        // Panel toolbar is not displayed for disabled panels.
        var chrome = Firebug.chrome;
        Dom.collapse(chrome.$("fbToolbar"), !panel);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    activatePanelTypes: function(panelTypes)
    {
        for (var i = 0; i < panelTypes.length; i++)
        {
            var panelType = panelTypes[i];
            if (!this.isPanelActivable(panelType))
                continue;

            if (this.isPanelEnabled(panelType))
                panelType.prototype.onActivationChanged(true);
        }
    },

    deactivatePanelTypes: function(panelTypes)
    {
        for (var i = 0; i < panelTypes.length; i++)
        {
            var panelType = panelTypes[i];
            if (!this.isPanelActivable(panelType))
                continue;

            if (this.isPanelEnabled(panelType))
                panelType.prototype.onActivationChanged(false);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    isPanelActivable: function(panelType)
    {
        return panelType.prototype.activable ? true : false;
    },

    isPanelEnabled: function(panelType)
    {
        if (typeof(panelType) == "string")
            panelType = Firebug.getPanelType("script");

        if (!this.isPanelActivable(panelType))
            return true;

        // Panel "class" object is used to decide whether a panel is disabled
        // or not (i.e.: isEnabled is a static method of Firebug.Panel)
        return panelType ? panelType.prototype.isEnabled() : false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Enable & disable methods.

    enablePanel: function(panelType)
    {
        this.setPanelState(panelType, true);
    },

    disablePanel: function(panelType)
    {
        this.setPanelState(panelType, false);
    },

    enableAllPanels: function()
    {
        for (var i = 0; i < Firebug.panelTypes.length; i++)
        {
            var panelType = Firebug.panelTypes[i];
            this.setPanelState(panelType, true);
        }
    },

    disableAllPanels: function()
    {
        for (var i = 0; i < Firebug.panelTypes.length; i++)
        {
            var panelType = Firebug.panelTypes[i];
            this.setPanelState(panelType, false);
        }
    },

    setPanelState: function(panelType, enable)
    {
        if (panelType && panelType.prototype.setEnabled)
            panelType.prototype.setEnabled(enable);

        this.updateTab(panelType);
    },

    updateTab: function(panelType)
    {
        var panelName = panelType.prototype.name;
        var panelBar = Firebug.chrome.$("fbPanelBar1");
        var tab = panelBar.updateTab(panelType);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Observer activation changes (preference)

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
            var panelType = Firebug.getPanelType(panelName);
            if (panelType)
            {
                var enable = Options.get(panelName + ".enableSites");
                this.onActivationChanged(panelType, enable);
            }
        }
        catch (e)
        {
            if (FBTrace.DBG_ACTIVATION || FBTrace.DBG_ERRORS)
                FBTrace.sysout("PanelActivation.observe; EXCEPTION " + e, e);
        }
    },

    onActivationChanged: function(panelType, enable)
    {
        if (!enable)
        {
            // Iterate all contexts and destroy all instances of the specified panel.
            var self = this;
            Firebug.connection.eachContext(function(context) {
                context.destroyPanel(panelType, context.persistedState);
            });
        }

        panelType.prototype.onActivationChanged(enable);

        this.dispatch("activationChanged", [panelType, enable]);

        Firebug.chrome.$("fbPanelBar1").updateTab(panelType);
        Firebug.chrome.syncPanel();
    },

    // respond to event
    onClearAnnotations: function()
    {
        Firebug.closeFirebug(true);  // and we turn off as it now cannot be enabled
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI commands

    clearAnnotations: function(force)
    {
        // If 'force' is set to true, ignore preference and skip the confirmation dialog.
        // Note that the argument is used by automated tests.
        var skipConfirmation = (typeof(force) == "boolean" && force === true);
        if (skipConfirmation)
        {
            Firebug.connection.clearAnnotations();
            return;
        }

        // Show the confirmation dialog only if the preference/user says so.
        var clearConfirmationPref = "clearAnnotationsConfirmation";
        if (Options.get(clearConfirmationPref))
        {
            var check = {value: false};
            var flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_YES +
            prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_NO;

            if (!prompts.confirmEx(Firebug.chrome.window, Locale.$STR("Firebug"),
                Locale.$STR("annotations.confirm.clear"), flags, "", "", "",
                Locale.$STR("Do_not_show_this_message_again"), check) == 0)
            {
                return;
            }

            Options.set(clearConfirmationPref, !check.value);
        }

        Firebug.connection.clearAnnotations();
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

        Options.set("allPagesActivation", Firebug.allPagesActivation);
        this.updateAllPagesActivation();
    },

    updateOption: function(name, value)
    {
        if (name == "allPagesActivation")
            this.updateAllPagesActivation();
    },

    updateAllPagesActivation: function()
    {
        // don't show Off button if we are always on
        var allOn = Firebug.allPagesActivation == "on";
        Firebug.chrome.disableOff(allOn);

        Firebug.StartButton.resetTooltip();
    },

    allOn: function()
    {
        Firebug.allPagesActivation = "on";  // In future we always create contexts,
        Firebug.toggleBar(true);  // and we turn on for the current page
    }
});

// ********************************************************************************************* //
// Disabled Panel Box

/**
 * @domplate This template renders default content for disabled panels.
 */
Firebug.DisabledPanelBox = domplate(Firebug.Rep,
/** @lends Firebug.DisabledPanelBox */
{
    tag:
        DIV({"class": "disabledPanelBox"},
            H1({"class": "disabledPanelHead"},
                SPAN("$pageTitle")
            ),
            P({"class": "disabledPanelDescription", style: "margin-top: 15px;"},
                Locale.$STR("moduleManager.desc3"),
                SPAN("&nbsp;"),
                SPAN({"class": "descImage descImage-$panelName"})
            ),
            A({"class": "objectLink", onclick: "$onEnable"},
                Locale.$STR("moduleManager.Enable")
            )
            /* need something here that pushes down any thing appended to the panel */
        ),

    onEnable: function(event)
    {
        var view = event.target.ownerDocument.defaultView;
        var isMainPanel = (view.name == "fbPanelBar1-browser");
        var panelBar = Firebug.chrome.$(isMainPanel ? "fbPanelBar1" : "fbPanelBar2");

        var panelType = panelBar.selectedTab.panelType;
        if (panelType.prototype.setEnabled)
        {
            panelType.prototype.setEnabled(true);
            panelBar.updateTab(panelType);
        }
        else
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("panelActivation.onEnable; panel is not activable: " +
                    Firebug.getPanelTitle(panelType));
            }
        }
    },

    /**
     * Show default content saying that this panel type (specified by name) is disabled.
     * The parent node is specified in panel.html file.
     */
    show: function(browser, panelName)
    {
        if (!panelName)
            return;

        var panel = Firebug.getPanelType(panelName);
        var panelTitle = Firebug.getPanelTitle(panel);
        var args = {
            pageTitle: Locale.$STRF("moduleManager.title", [panelTitle]),
            panelName: panelName
        };

        var parentNode = this.getParentNode(browser);
        this.tag.replace(args, parentNode, this);
        parentNode.removeAttribute("collapsed");

        // Dispatch an event to UI listeners, so the box can be customized.
        Firebug.dispatch(Firebug.uiListeners, "showDisabledPanelBox",
            [panelName, parentNode]);
    },

    /**
     * Hide currently displayed default content.
     */
    hide: function(browser)
    {
        var parentNode = this.getParentNode(browser);

        // xxxHonza: I am seeing null parentNode when Firebug initializes
        // Could it be because the panel.html can sometimes take more time to load?
        if (!parentNode)
            return;

        Dom.clearNode(parentNode);
        parentNode.setAttribute("collapsed", true);
    },

    getParentNode: function(browser)
    {
        var doc = browser.contentDocument;
        return doc.documentElement.querySelector(".disabledPanelNode");
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.PanelActivation);

return Firebug.PanelActivation;

// ********************************************************************************************* //
});
