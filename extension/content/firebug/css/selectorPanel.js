/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/events",
    "firebug/lib/persist",
    "firebug/css/selectorModule",
    "firebug/css/selectorEditor"
],
function(FBTrace, Obj, Domplate, Locale, Dom, Css, Events, Persist, CSSSelectorsModule,
    SelectorEditor) {

with (Domplate) {

// ********************************************************************************************* //
// CSS Computed panel (HTML side panel)

function CSSSelectorsPanel() {}

CSSSelectorsPanel.prototype = Obj.extend(Firebug.Panel,
{
    template: domplate(
    {
        selectorsTag:
            DIV({"class": "selectorTrials a11yCSSView", role: "list", "aria-label":
                Locale.$STR("aria.labels.Elements")},
                TAG("$selectorEditorRow"),
                DIV({"class": "elementsGroups"},
                    FOR("group", "$groups",
                        TAG("$elementsGroupTag", {group: "$group", windows: "$windows"})
                    )
                )),

        selectorEditorRow:
            DIV({"class": "selectorEditorContainer editorContainer a11yFocusNoTab",
                role: "button", "tabindex" : "0",
                "aria-label": Locale.$STR("a11y.labels.press enter to add new selector"),
                onclick: "$onClickEditor"},
                Locale.$STR("css.selector.TryASelector")
            ),

        elementsGroupTag:
            DIV({"class": "elementsGroup foldableGroup", $opened: "$group.opened",
                role: "list", _repObject: "$group"},
                H1({"class": "cssElementsHeader groupHeader focusRow", role: "listitem"},
                    DIV({"class": "twisty", role: "presentation"}),
                    SPAN({"class": "cssElementsLabel groupLabel"}, "$group.selector")
                ),
                TAG("$elementsTag", {elements: "$windows,$group.selector|getElements"})
            ),
            
        elementsTag:
            TABLE({"class": "cssElementsTable groupContent", role: "list"},
                TBODY({role: "presentation"},
                    FOR("element", "$elements",
                        TR({"class": "focusRow cssElementsRow cssElements",
                                role: "listitem", _repObject: "$element"},
                            TD({"class": "cssElement", role: "presentation"},
                                TAG("$element|getElementTag", {object: "$element"})
                            )
                        )
                    )
                )
            ),

        getElementTag: function(value)
        {
            var rep = Firebug.getRep(value);
            var tag = rep.shortTag ? rep.shortTag : rep.tag;
            return tag;
        },
    
        getElements: function(windows, selector)
        {
            return CSSSelectorsModule.matchElements(windows, selector);
        },

        onClickEditor: function(event)
        {
            var target = event.currentTarget;
            var panel = Firebug.getElementPanel(target);
            Firebug.Editor.startEditing(target, "");
        }
    }),

    getEditor: function(target, value)
    {
        if (!this.editor)
            this.editor = new CSSSelectorsPanelEditor(this.document);

        return this.editor;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Events

    onClick: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        var header = Dom.getAncestorByClass(event.target, "groupHeader");
        if (header)
            this.toggleGroup(event.target);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Extends Panel

    name: "selectors",
    parentPanel: "stylesheet",
    order: 0,

    initialize: function()
    {
        this.groups = [];
        this.onClick = Obj.bind(this.onClick, this);

        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        state.groups = this.groups;
        Persist.persistObjects(this, state);

        Firebug.Panel.destroyNode.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        Firebug.Panel.initializeNode.apply(this, arguments);

        Events.addEventListener(this.panelNode, "click", this.onClick, false);
    },

    destroyNode: function()
    {
        Firebug.Panel.destroyNode.apply(this, arguments);

        Events.removeEventListener(this.panelNode, "click", this.onClick, false);
    },

    supportsObject: function(object)
    {
        return 0;
    },

    show: function(state)
    {
        Persist.restoreObjects(this, state);

        if (state)
        {
            if (state.groups)
                this.groups = state.groups;
        }

        this.refresh();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Groups

    addGroup: function(selector)
    {
        var group = {
            selector: selector,
            opened: true
        }
        this.groups.push(group);

        // Append element group to display
        var elementsGroups = this.panelNode.getElementsByClassName("elementsGroups")[0];
        var action = elementsGroups.getElementsByClassName("noSelection")[0] ?
            "replace" : "append";
        var elementsGroup = this.template.elementsGroupTag[action](
            {group: group, windows: this.context.windows}, elementsGroups);

        // If there are no elements matching the selector, display an info message
        if (elementsGroup.getElementsByClassName("cssElements").length == 0)
        {
            var elementsTable = elementsGroup.getElementsByClassName("cssElementsTable")[0]; 
            WarningTemplate.noSelectionResultsTag.replace({}, elementsTable);
        }
    },

    toggleGroup: function(node)
    {
        var groupsNode = Dom.getAncestorByClass(node, "elementsGroups");
        var groupNode = Dom.getAncestorByClass(node, "elementsGroup");
        var group = Firebug.getRepObject(groupNode);

        Css.toggleClass(groupNode, "opened");
        var opened = Css.hasClass(groupNode, "opened");
        group.opened = opened;

        if (opened)
        {
            var offset = Dom.getClientOffset(node);
            FBTrace.sysout("offset", offset);
            var titleAtTop = offset.y < groupsNode.scrollTop;

            Dom.scrollTo(groupNode, groupsNode, null,
                groupNode.offsetHeight > groupsNode.clientHeight || titleAtTop ? "top" : "bottom");
        }
    },

    refresh: function()
    {
        var parentNode = this.template.selectorsTag.replace(
                {groups: this.groups, windows: this.context.windows}, this.panelNode);

        if (this.groups.length == 0)
        {
            var elementsGroups = parentNode.getElementsByClassName("elementsGroups")[0];
            WarningTemplate.noSelectionTag.replace({}, elementsGroups);
        }
    }
});

function CSSSelectorsPanelEditor(doc)
{
    this.box = this.tag.replace({}, doc, this);
    this.input = this.box;

    Firebug.InlineEditor.prototype.initialize.call(this);
    this.tabNavigation = false;
    this.fixedWidth = true;
}

CSSSelectorsPanelEditor.prototype = domplate(SelectorEditor.prototype,
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
        if (cancel || value == "")
            return;

        if (this.isValidSelector(value))
            this.panel.addGroup(value);
    },

    isValidSelector: function(value)
    {
        try {
            this.panel.panelNode.querySelector(value);
            return true;
        }
        catch (e)
        {
            return false;
        }
    }
});

//********************************************************************************************* //

var WarningTemplate = domplate(Firebug.Rep,
{
    noSelectionTag:
        DIV({"class": "selectorWarning noSelection"},
            SPAN(Locale.$STR("css.selector.noSelection"))
        ),

    noSelectionResultsTag:
        DIV({"class": "selectorWarning"},
            SPAN(Locale.$STR("css.selector.noSelectionResults"))
        )
});

//********************************************************************************************* //
//Registration

Firebug.registerPanel(CSSSelectorsPanel);

return CSSSelectorsPanel;

//********************************************************************************************* //
}});
