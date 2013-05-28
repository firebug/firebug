/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/events",
    "firebug/css/selectorModule",
    "firebug/css/selectorEditor"
],
function(FBTrace, Obj, Domplate, Locale, Dom, Css, Events, CSSSelectorsModule, SelectorEditor) {

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
    // Extends Panel

    name: "selectors",
    parentPanel: "stylesheet",
    order: 0,

    initialize: function()
    {
        this.groups = [
            {
                selector: "div",
                opened: true
            },
            {
                selector: "p > span",
                opened: true
            }
        ];

        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        Firebug.Panel.destroyNode.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        Firebug.Panel.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        Firebug.Panel.destroyNode.apply(this, arguments);
    },

    supportsObject: function(object)
    {
        return 0;
    },

    show: function(state)
    {
        this.refresh();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Groups

    refresh: function()
    {
        var parentNode = this.template.selectorsTag.replace(
                {groups: this.groups, windows: this.context.windows}, this.panelNode);
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
        )
});

//********************************************************************************************* //
//Registration

Firebug.registerPanel(CSSSelectorsPanel);

return CSSSelectorsPanel;

//********************************************************************************************* //
}});
