/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/firefox/firefox",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/firefox/xpcom",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/js/sourceLink",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/xpath",
    "firebug/lib/array",
    "firebug/css/cssPanel",
],
function(Obj, Firebug, Firefox, Domplate, FirebugReps, Xpcom, Locale, Events, Url,
    SourceLink, Dom, Css, Xpath, Arr, CSSStyleSheetPanel) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIDOMCSSStyleRule = Ci.nsIDOMCSSStyleRule;

// before firefox 6 getCSSStyleRules accepted only one argument
const DOMUTILS_SUPPORTS_PSEUDOELEMENTS = Dom.domUtils.getCSSStyleRules.length > 1;

// See: http://mxr.mozilla.org/mozilla1.9.2/source/content/events/public/nsIEventStateManager.h#153
const STATE_ACTIVE  = 0x01;
const STATE_FOCUS   = 0x02;
const STATE_HOVER   = 0x04;

// ********************************************************************************************* //
// CSS Elemenet Panel (HTML side panel)

function CSSElementPanel() {}

CSSElementPanel.prototype = Obj.extend(CSSStyleSheetPanel.prototype,
{
    template: domplate(
    {
        cascadedTag:
            DIV({"class": "a11yCSSView", role: "presentation"},
                DIV({role: "list", "aria-label": Locale.$STR("aria.labels.style rules") },
                    FOR("rule", "$rules",
                        TAG("$ruleTag", {rule: "$rule"})
                    )
                ),
                DIV({role: "list", "aria-label": Locale.$STR("aria.labels.inherited style rules")},
                    FOR("section", "$inherited",
                        H1({"class": "cssInheritHeader groupHeader focusRow", role: "listitem" },
                            SPAN({"class": "cssInheritLabel"}, "$inheritLabel"),
                            TAG(FirebugReps.Element.shortTag, {object: "$section.element"})
                        ),
                        DIV({role: "group"},
                            FOR("rule", "$section.rules",
                                TAG("$ruleTag", {rule: "$rule"})
                            )
                        )
                    )
                 )
            ),

        ruleTag:
            DIV({"class": "cssElementRuleContainer"},
                TAG(Firebug.CSSStyleRuleTag.tag, {rule: "$rule"}),
                TAG(FirebugReps.SourceLink.tag, {object: "$rule.sourceLink"})
            )
    }),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // All calls to this method must call cleanupSheets first

    updateCascadeView: function(element)
    {
        var result, warning, inheritLabel;

        Events.dispatch(this.fbListeners, 'onBeforeCSSRulesAdded', [this]);
        var rules = [], sections = [], usedProps = {};
        this.getInheritedRules(element, sections, usedProps);
        this.getElementRules(element, rules, usedProps);

        if (rules.length || sections.length)
        {
            if (Firebug.onlyShowAppliedStyles)
                this.removeOverriddenProps(rules, sections);

            if (!Firebug.showUserAgentCSS) // This removes user agent rules
                this.removeSystemRules(rules, sections);
        }

        if (rules.length || sections.length)
        {
            inheritLabel = Locale.$STR("InheritedFrom");
            result = this.template.cascadedTag.replace({rules: rules, inherited: sections,
                inheritLabel: inheritLabel}, this.panelNode);
            Events.dispatch(this.fbListeners, 'onCSSRulesAdded', [this, result]);
        }
        else
        {
            warning = FirebugReps.Warning.tag.replace({object: ""}, this.panelNode);
            result = FirebugReps.Description.render(Locale.$STR("css.EmptyElementCSS"),
                warning, Obj.bind(this.editElementStyle, this));
            Events.dispatch([Firebug.A11yModel], 'onCSSRulesAdded', [this, result]);
        }
    },

    getStylesheetURL: function(rule, getBaseUri)
    {
        // if the parentStyleSheet.href is null, CSS std says its inline style
        if (rule && rule.parentStyleSheet && rule.parentStyleSheet.href)
            return rule.parentStyleSheet.href;
        else if (getBaseUri)
            return this.selection.ownerDocument.baseURI;
        else
            return this.selection.ownerDocument.location.href;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // All calls to this method must call cleanupSheets first

    getInheritedRules: function(element, sections, usedProps)
    {
        var parent = element.parentNode;
        if (parent && parent.nodeType == 1)
        {
            this.getInheritedRules(parent, sections, usedProps);

            var rules = [];
            this.getElementRules(parent, rules, usedProps, true);

            if (rules.length)
                sections.splice(0, 0, {element: parent, rules: rules});
        }
    },

    // All calls to this method must call cleanupSheets first
    getElementRules: function(element, rules, usedProps, inheritMode)
    {
        var pseudoElements = [""];
        var inspectedRules, displayedRules = {};

        // Firefox 6+ allows inspecting of pseudo-elements (see issue 537)
        if (DOMUTILS_SUPPORTS_PSEUDOELEMENTS && !inheritMode)
            pseudoElements = Arr.extendArray(pseudoElements,
                [":first-letter", ":first-line", ":before", ":after"]);

        for (var p in pseudoElements)
        {
            try
            {
                inspectedRules = Dom.domUtils.getCSSStyleRules(element, pseudoElements[p]);
            }
            catch (exc)
            {
                continue;
            }

            if (!inspectedRules)
                continue;

            for (var i = 0; i < inspectedRules.Count(); ++i)
            {
                var rule = Xpcom.QI(inspectedRules.GetElementAt(i), nsIDOMCSSStyleRule);
                var isSystemSheet = Url.isSystemStyleSheet(rule.parentStyleSheet);

                var props = this.getRuleProperties(this.context, rule, inheritMode);
                if (inheritMode && !props.length)
                    continue;

                var isPseudoElementSheet = (pseudoElements[p] != "");
                var sourceLink = this.getSourceLink(null, rule);

                if (!isPseudoElementSheet)
                    this.markOverriddenProps(props, usedProps, inheritMode);

                var ruleId = this.getRuleId(rule);
                rules.splice(0, 0, {rule: rule, id: ruleId,
                    // Show universal selectors with pseudo-class
                    // (http://code.google.com/p/fbug/issues/detail?id=3683)
                    selector: rule.selectorText.replace(/ :/g, " *:"),
                    sourceLink: sourceLink,
                    props: props, inherited: inheritMode,
                    isSystemSheet: isSystemSheet,
                    isPseudoElementSheet: isPseudoElementSheet,
                    isSelectorEditable: true
                });
            }
        }

        if (element.style)
            this.getStyleProperties(element, rules, usedProps, inheritMode);

        if (FBTrace.DBG_CSS)
            FBTrace.sysout("getElementRules "+rules.length+" rules for "+
                Xpath.getElementXPath(element), rules);
    },

    markOverriddenProps: function(props, usedProps, inheritMode)
    {
        for (var i = 0; i < props.length; ++i)
        {
            var prop = props[i];
            if (usedProps.hasOwnProperty(prop.name))
            {
                // all previous occurrences of this property
                var deadProps = usedProps[prop.name];
                for (var j = 0; j < deadProps.length; ++j)
                {
                    var deadProp = deadProps[j];
                    if (!deadProp.disabled && !deadProp.wasInherited && deadProp.important &&
                        !prop.important)
                    {
                        prop.overridden = true;  // new occurrence overridden
                    }
                    else if (!prop.disabled && (!deadProp.wasInherited))
                    {
                        deadProp.overridden = true;  // previous occurrences overridden
                    }
                }
            }
            else
            {
                usedProps[prop.name] = [];
            }

            prop.wasInherited = inheritMode ? true : false;

            // all occurrences of a property seen so far, by name
            usedProps[prop.name].push(prop);
        }
    },

    removeOverriddenProps: function(rules, sections)
    {
        function removeProps(rules)
        {
            var i=0;
            while (i<rules.length)
            {
                var props = rules[i].props;

                var j=0;
                while (j<props.length)
                {
                    if (props[j].overridden)
                        props.splice(j, 1);
                    else
                        ++j;
                }

                if (props.length == 0)
                    rules.splice(i, 1);
                else
                    ++i;
            }
        }

        removeProps(rules);

        var i=0;
        while (i < sections.length)
        {
            var section = sections[i];
            removeProps(section.rules);

            if (section.rules.length == 0)
                sections.splice(i, 1);
            else
                ++i;
        }
    },

    removeSystemRules: function(rules, sections)
    {
        function removeSystem(rules)
        {
            var i=0;
            while (i<rules.length)
            {
                if (rules[i].isSystemSheet)
                    rules.splice(i, 1);
                else
                    ++i;
            }
        }

        removeSystem(rules);

        var i=0;
        while (i<sections.length)
        {
            var section = sections[i];
            removeSystem(section.rules);

            if (section.rules.length == 0)
                sections.splice(i, 1);
            else
                ++i;
        }
    },

    getStyleProperties: function(element, rules, usedProps, inheritMode)
    {
        var props = this.parseCSSProps(element.style, inheritMode);
        this.addOldProperties(this.context, Xpath.getElementXPath(element), inheritMode, props);

        this.sortProperties(props);

        this.markOverriddenProps(props, usedProps, inheritMode);

        if (props.length)
        {
            rules.splice(0, 0,
                {rule: element, id: Xpath.getElementXPath(element),
                    selector: "element.style", props: props, inherited: inheritMode});
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "css",
    parentPanel: "html",
    order: 0,

    initialize: function()
    {
        this.onMouseDown = Obj.bind(this.onMouseDown, this);
        this.onClick = Obj.bind(this.onClick, this);
        this.onStateChange = Obj.bindFixed(this.contentStateCheck, this);
        this.onHoverChange = Obj.bindFixed(this.contentStateCheck, this, STATE_HOVER);
        this.onActiveChange = Obj.bindFixed(this.contentStateCheck, this, STATE_ACTIVE);

        // We only need the basic panel initialize, not the intermeditate objects
        Firebug.Panel.initialize.apply(this, arguments);
    },

    show: function(state)
    {
    },

    watchWindow: function(context, win)
    {
        if (Dom.domUtils)
        {
            // Normally these would not be required, but in order to update after the state is set
            // using the options menu we need to monitor these global events as well
            var doc = win.document;
            context.addEventListener(doc, "mouseover", this.onHoverChange, false);
            context.addEventListener(doc, "mousedown", this.onActiveChange, false);
        }
    },

    unwatchWindow: function(context, win)
    {
        var doc = win.document;
        context.removeEventListener(doc, "mouseover", this.onHoverChange, false);
        context.removeEventListener(doc, "mousedown", this.onActiveChange, false);

        if (Dom.isAncestor(this.stateChangeEl, doc))
        {
            this.removeStateChangeHandlers();
        }
    },

    supportsObject: function(object, type)
    {
        return object instanceof window.Element ? 1 : 0;
    },

    updateView: function(element)
    {
        Firebug.CSSModule.cleanupSheets(element.ownerDocument, Firebug.currentContext);

        this.updateCascadeView(element);

        if (Dom.domUtils)
        {
            this.contentState = safeGetContentState(element);
            this.addStateChangeHandlers(element);
        }
    },

    updateSelection: function(element)
    {
        if (!(element instanceof window.Element)) // html supports SourceLink
            return;

        var sothinkInstalled = !!Firefox.getElementById("swfcatcherKey_sidebar");
        if (sothinkInstalled)
        {
            var div = FirebugReps.Warning.tag.replace({object: "SothinkWarning"}, this.panelNode);
            div.innerHTML = Locale.$STR("SothinkWarning");
            return;
        }

        if (!element)
            return;

        this.updateView(element);
    },

    updateOption: function(name, value)
    {
        if (name == "showUserAgentCSS" || name == "expandShorthandProps" ||
            name == "onlyShowAppliedStyles")
        {
            this.refresh();
        }
    },

    getOptionsMenuItems: function()
    {
        var ret = [
            {
                label: "Only Show Applied Styles",
                type: "checkbox",
                checked: Firebug.onlyShowAppliedStyles,
                command: Obj.bindFixed(Firebug.Options.togglePref, Firebug.Options,
                    "onlyShowAppliedStyles")
            },
            {
                label: "Show User Agent CSS",
                type: "checkbox",
                checked: Firebug.showUserAgentCSS,
                command: Obj.bindFixed(Firebug.Options.togglePref, Firebug.Options,
                    "showUserAgentCSS")
            },
            {
                label: "Expand Shorthand Properties",
                type: "checkbox",
                checked: Firebug.expandShorthandProps,
                command: Obj.bindFixed(Firebug.Options.togglePref, Firebug.Options,
                    "expandShorthandProps")
            }
        ];

        if (Dom.domUtils && this.selection)
        {
            var state = safeGetContentState(this.selection);
            var self = this;

            ret.push("-");

            ret.push({label: ":active", type: "checkbox", checked: state & STATE_ACTIVE,
                command: function() {
                    self.updateContentState(STATE_ACTIVE, !this.getAttribute("checked"));
                }
            });

            ret.push({label: ":hover", type: "checkbox", checked: state & STATE_HOVER,
                command: function() {
                    self.updateContentState(STATE_HOVER, !this.getAttribute("checked"));
                }
            });
        }

        return ret;
    },

    updateContentState: function(state, remove)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("css.updateContentState; state: " + state + ", remove: " + remove);

        Dom.domUtils.setContentState(remove ? this.selection.ownerDocument.documentElement :
            this.selection, state);

        this.refresh();
    },

    addStateChangeHandlers: function(el)
    {
        this.removeStateChangeHandlers();

        Events.addEventListener(el, "focus", this.onStateChange, true);
        Events.addEventListener(el, "blur", this.onStateChange, true);
        Events.addEventListener(el, "mouseup", this.onStateChange, false);
        Events.addEventListener(el, "mousedown", this.onStateChange, false);
        Events.addEventListener(el, "mouseover", this.onStateChange, false);
        Events.addEventListener(el, "mouseout", this.onStateChange, false);

        this.stateChangeEl = el;
    },

    removeStateChangeHandlers: function()
    {
        var sel = this.stateChangeEl;
        if (sel)
        {
            Events.removeEventListener(sel, "focus", this.onStateChange, true);
            Events.removeEventListener(sel, "blur", this.onStateChange, true);
            Events.removeEventListener(sel, "mouseup", this.onStateChange, false);
            Events.removeEventListener(sel, "mousedown", this.onStateChange, false);
            Events.removeEventListener(sel, "mouseover", this.onStateChange, false);
            Events.removeEventListener(sel, "mouseout", this.onStateChange, false);
        }

        this.stateChangeEl = null;
    },

    contentStateCheck: function(state)
    {
        if (!state || this.contentState & state)
        {
            var timeoutRunner = Obj.bindFixed(function()
            {
                var newState = safeGetContentState(this.selection);
                if (newState != this.contentState)
                {
                    this.context.invalidatePanels(this.name);
                }
            }, this);

            // Delay exec until after the event has processed and the state has been updated
            setTimeout(timeoutRunner, 0);
      }
    }
});

// ********************************************************************************************* //
// Helpers

function safeGetContentState(selection)
{
    try
    {
        if (selection && selection.ownerDocument)
            return Dom.domUtils.getContentState(selection);
    }
    catch (e)
    {
        if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
            FBTrace.sysout("css.safeGetContentState; EXCEPTION "+e, e);
    }
}

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(CSSElementPanel);

return CSSElementPanel;

// ********************************************************************************************* //
}});
