/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/chrome/menu",
    "firebug/css/selectorEditor",
    "firebug/css/selectorModule",
],
function(Firebug, Obj, Locale, Events, Dom, Domplate, Menu, SelectorEditor) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);

// ********************************************************************************************* //
// CSS Selector Panel

/**
 * @panel Selector side panel displaying HTML elements for the current selector,
 * either from the CSS main panel or user entry
 */
function SelectorPanel() {}
SelectorPanel.prototype = Obj.extend(Firebug.Panel,
/** @lends SelectorPanel */
{
    name: "selector",
    parentPanel: "stylesheet",
    title: Locale.$STR("css.selector.Selection"),
    editable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(context, doc)
    {
        Firebug.Panel.initialize.apply(this, arguments);
    },

    shutdown: function(context, doc)
    {
        Firebug.Panel.shutdown.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        Firebug.Panel.initializeNode.apply(this, arguments);

        this.setSelection = Obj.bind(this.setSelection, this);
        this.clearSelection = Obj.bind(this.clearSelection, this);
        this.lockSelection = Obj.bind(this.lockSelection, this);

        var panelNode = this.mainPanel.panelNode;
        // See: http://code.google.com/p/fbug/issues/detail?id=5931
        //Events.addEventListener(panelNode, "mouseover", this.setSelection, false);
        //Events.addEventListener(panelNode, "mouseout", this.clearSelection, false);
        //Events.addEventListener(panelNode, "mousedown", this.lockSelection, false);
    },

    destroyNode: function()
    {
        var panelNode = this.mainPanel.panelNode;
        //Events.removeEventListener(panelNode, "mouseover", this.setSelection, false);
        //Events.removeEventListener(panelNode, "mouseout", this.clearSelection, false);
        //Events.removeEventListener(panelNode, "mousedown", this.lockSelection, false);

        Firebug.Panel.destroyNode.apply(this, arguments);
    },

    show: function(state)
    {
        Firebug.Panel.show.apply(this, arguments);

        this.refresh();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getCSSStyleRule: function(event)
    {
        var object = Firebug.getRepObject(event.target);

        if (object && (object instanceof window.CSSStyleRule))
            return object;
    },

    getCSSRuleElement: function(element)
    {
        while (element && !element.classList.contains("cssRule"))
            element = element.parentNode;

        return element;
    },

    getMatchingElements: function(rule)
    {
        this.trialSelector = rule.selectorText;
        this.selection = rule;
        this.rebuild();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Selection

    setSelection: function(event)
    {
        var rule = this.getCSSStyleRule(event);

        if (rule)
        {
            // then we have entered a rule element
            var ruleElement = this.getCSSRuleElement(event.target);
            if (ruleElement && ruleElement !== this.lockedElement)
                ruleElement.classList.add("selectedSelectorRule");

            this.selection = rule;
            this.rebuild();
        }
    },

    clearSelection: function(event)
    {
        if (this.selection !== this.lockedSelection)
        {
            this.selection = this.lockedSelection;
            this.rebuild();
        }

        var rule = this.getCSSStyleRule(event);
        if (rule)
        {
            // then we are leaving a rule element that we may have highlighted.
            var ruleElement = this.getCSSRuleElement(event.target);
            if (ruleElement)
                ruleElement.classList.remove("selectedSelectorRule");
        }
    },

    lockSelection: function(event)
    {
        var rule = this.getCSSStyleRule(event);
        if (rule)
        {
            if (this.lockedElement)
                this.lockedElement.classList.remove("lockedSelectorRule");

            this.lockedElement = this.getCSSRuleElement(event.target);

            if (this.lockedElement)
            {
                this.lockedElement.classList.add("lockedSelectorRule");
                this.lockedElement.classList.remove("selectedSelectorRule");
            }

            this.lockedSelection = rule;
        }
    },

    hide: function()
    {
        Firebug.Panel.hide.apply(this, arguments);
    },

    refresh: function()
    {
        var root = this.context.window.document.documentElement;
        this.selection = this.mainPanel.selection;

        // Use trial selector if there is no selection in the CSS panel.
        if (!this.selection)
            this.selection = this.trialSelector;

        this.rebuild(true);
    },

    /**
     * returns an array of Elements matched from selector
     */
    getSelectedElements: function(selectorText)
    {
        var elements = [];

        // Execute the query also in all iframes (see issue 5962)
        var windows = this.context.windows;
        for (var i=0; i<windows.length; i++)
        {
            var win = windows[i];
            var selections = win.document.querySelectorAll(selectorText);

            // For some reason the return value of querySelectorAll()
            // is not recognized as a NodeList anymore since Firefox 10.0.
            // See issue 5442.
            // But since there can be more iframes we need to collect all matching
            // elements in an extra array anyway.
            if (selections)
            {
                for (var j=0; j<selections.length; j++)
                    elements.push(selections[j]);
            }
            else
            {
                throw new Error("Selection Failed: " + selections);
            }
        }

        return elements;
    },

    /**
     * Build content of the panel. The basic layout of the panel is generated by
     * {@link SelectorTemplate} template.
     */
    rebuild: function()
    {
        if (this.selection)
        {
            try
            {
                var selectorText;

                if (this.selection instanceof window.CSSStyleRule)
                    selectorText = this.selection.selectorText;
                else
                    selectorText = this.selection;

                var elements = this.getSelectedElements(selectorText);
                if (elements && elements.length != 0)
                {
                    SelectorTemplate.tag.replace({object: elements}, this.panelNode);
                    this.showTrialSelector(this.trialSelector);
                    return;
                }
            }
            catch (e)
            {
                var table = SelectorTemplate.tag.replace({object: []}, this.panelNode);
                var tbody = table.lastChild;

                WarningTemplate.selectErrorTag.insertRows({object: e}, tbody.lastChild);
                WarningTemplate.selectErrorTextTag.insertRows({object: e}, tbody.lastChild);

                this.showTrialSelector(this.trialSelector);
                return;
            }
        }

        var table = SelectorTemplate.tag.replace({object: []}, this.panelNode);
        var tbody = table.lastChild;

        if (this.trialSelector)
        {
            WarningTemplate.noSelectionResultsTag.insertRows(
                {object: this.selection}, tbody.lastChild)
        }
        else
        {
            WarningTemplate.noSelectionTag.insertRows(
                {object: this.selection}, tbody.lastChild);
        }

        this.showTrialSelector(this.trialSelector);
    },

    getObjectPath: function(object)
    {
        if (FBTrace.DBG_SELECTOR)
            FBTrace.sysout("css.selector.getObjectPath NOOP", object);
    },

    supportsObject: function(object)
    {
        return 0;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    tryASelector: function(element)
    {
        if (!this.trialSelector)
            this.trialSelector = this.selection ? this.selection.selectorText : "";

        this.editProperty(element, this.trialSelector);
    },

    editProperty: function(row, editValue)
    {
        Firebug.Editor.startEditing(row, editValue);
    },

    getEditor: function(target, value)
    {
        if (!this.editor)
            this.editor = new SelectorPanelEditor(this.document);

        return this.editor;
    },

    setTrialSelector: function(target, value)
    {
        if (this.lockedElement)
            this.lockedElement.classList.remove("lockedSelectorRule");

        this.trialSelector = value;
        this.selection = this.trialSelector;
        this.lockedElement = target;
        this.lockedSelection = this.selection;
        this.rebuild();
    },

    showTrialSelector: function(trialSelector)
    {
        var show = trialSelector ? true : false;
        Dom.collapse(this.document.getElementById("trialHint"), show);

        var trialSelectorDiv = this.document.getElementById("trialSelector");
        trialSelectorDiv.textContent = trialSelector;
        Dom.collapse(trialSelectorDiv, !show);
    },
});

function SelectorPanelEditor(doc)
{
    this.box = this.tag.replace({}, doc, this);
    this.input = this.box;

    Firebug.InlineEditor.prototype.initialize.call(this);
    this.tabNavigation = false;
    this.fixedWidth = true;
}

SelectorPanelEditor.prototype = domplate(SelectorEditor.prototype,
{
    tag:
        INPUT({"class": "fixedWidthEditor a11yFocusNoTab",
            type: "text",
            title: Locale.$STR("Selector"),
            oninput: "$onInput",
            onkeypress: "$onKeyPress"}
        ),

    endEditing: function(target, value, cancel)
    {
        if (cancel)
            return;

        this.panel.setTrialSelector(target, value);
    }
});

// ********************************************************************************************* //

var BaseRep = domplate(Firebug.Rep,
{
    // xxxHonza: shouldn't this be in Firebug.Rep?
    getNaturalTag: function(value)
    {
        var rep = Firebug.getRep(value);
        var tag = rep.shortTag ? rep.shortTag : rep.tag;
        return tag;
    }
});

// ********************************************************************************************* //

var TrialRow =
    TR({"class": "watchNewRow", level: 0, onclick: "$onClickEditor"},
        TD({"class": "watchEditCell", colspan: 3},
            DIV({"class": "watchEditBox a11yFocusNoTab", "id": "trialHint",
                role: "button", "tabindex" : "0",
                "aria-label": Locale.$STR("a11y.labels.press enter to add new selector")},
                Locale.$STR("css.selector.TryASelector")
            ),
            DIV({"class": "trialSelector", "id": "trialSelector"}, "")
        )
    );

// ********************************************************************************************* //

/**
 * @domplate: Template for basic layout of the {@link SelectorPanel} panel.
 */
var SelectorTemplate = domplate(BaseRep,
{
    // object will be array of elements CSSStyleRule
    tag:
        TABLE({"class": "cssSelectionTable", cellpadding: 0, cellspacing: 0},
            TBODY({"class": "cssSelectionTBody"},
                TrialRow,
                FOR("element", "$object",
                    TR({"class": "selectionElementRow", _repObject: "$element"},
                        TD({"class": "selectionElement"},
                            TAG( "$element|getNaturalTag", {object: "$element"})
                        )
                    )
                )
            )
        ),

    onClickEditor: function(event)
    {
        var tr = event.currentTarget;
        var panel = Firebug.getElementPanel(tr);
        panel.tryASelector(tr);
    },
});

// ********************************************************************************************* //

var WarningTemplate = domplate(Firebug.Rep,
{
    noSelectionTag:
        TR({"class": "selectorWarning"},
            TD({"class": "selectionElement"}, Locale.$STR("css.selector.noSelection"))
        ),

    noSelectionResultsTag:
        TR({"class": "selectorWarning"},
            TD({"class": "selectionElement"}, Locale.$STR("css.selector.noSelectionResults"))
        ),

    selectErrorTag:
        TR({"class": "selectorWarning"},
            TD({"class": "selectionElement"}, Locale.$STR("css.selector.selectorError"))
        ),

    selectErrorTextTag:
        TR({"class": "selectorWarning"},
            TD({"class": "selectionErrorText selectionElement"},
                SPAN("$object|getErrorMessage")
            )
        ),

    getErrorMessage: function(object)
    {
        if (object.message)
            return object.message;

        return Locale.$STR("css.selector.unknownErrorMessage");
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerStylesheet("chrome://firebug/skin/selector.css");
Firebug.registerPanel(SelectorPanel);

return SelectorPanel;

// ********************************************************************************************* //
}});
