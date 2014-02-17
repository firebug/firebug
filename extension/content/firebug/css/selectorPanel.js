/* See license.txt for terms of usage */

define([
    "firebug/chrome/panel",
    "firebug/chrome/rep",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/chrome/window",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/events",
    "firebug/lib/persist",
    "firebug/css/selectorModule",
    "firebug/css/selectorEditor",
    "firebug/editor/editor",
],
function(Panel, Rep, FBTrace, Obj, Domplate, Locale, Win, Dom, Css, Events, Persist,
    CSSSelectorsModule, SelectorEditor, Editor) {

// ********************************************************************************************* //
// Constants

var {domplate, FOR, TAG, DIV, SPAN, TD, TR, TABLE, TBODY, H1, P, A, BR, INPUT} = Domplate;

// ********************************************************************************************* //
// CSS Computed panel (HTML side panel)

function CSSSelectorsPanel() {}

CSSSelectorsPanel.prototype = Obj.extend(Panel,
{
    template: domplate(
    {
        selectorsTag:
            DIV({"class": "selectorTrials a11yCSSView", role: "list", "aria-label":
                Locale.$STR("aria.labels.Selectors")},
                TAG("$selectorEditorRow"),
                DIV({"class": "elementsGroups"})
            ),

        selectorEditorRow:
            DIV({"class": "selectorEditorContainer editorContainer a11yFocusNoTab",
                role: "button", "tabindex" : "0",
                "aria-label": Locale.$STR("a11y.labels.press_enter_to_add_new_selector"),
                onclick: "$onClickEditor"},
                Locale.$STR("css.selector.TryASelector")
            ),

        elementsGroupTag:
            DIV({"class": "elementsGroup foldableGroup", $opened: "$group.opened",
                role: "list", _repObject: "$group"},
                H1({"class": "cssElementsHeader groupHeader focusRow", role: "listitem"},
                    DIV({"class": "twisty", role: "presentation"}),
                    SPAN({"class": "cssElementsLabel groupLabel"}, "$group.selector"),
                    DIV({"class": "closeButton selectorGroupRemoveButton"})
                )
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

        onClickEditor: function(event)
        {
            var target = event.currentTarget;
            var panel = Firebug.getElementPanel(target);
            Editor.startEditing(target, "");
        }
    }),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Events

    onClick: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        var header = Dom.getAncestorByClass(event.target, "groupHeader");
        if (header)
        {
            var removeButton = Dom.getAncestorByClass(event.target, "selectorGroupRemoveButton");
            if (removeButton)
            {
                var group = Firebug.getRepObject(event.target);
                this.removeGroup(group.selector);
            }
            else
            {
                this.toggleGroup(event.target);
            }
        }
    },

    onMutationObserve: function(records)
    {
        var refresh = false;

        // To refresh the panel check whether there's at least one element, that isn't ignored
        for (var i=0, recordsLen=records.length; i<recordsLen; ++i)
        {
            var record = records[i];
            switch(record.type)
            {
                case "childList":
                    var nodes = record.addedNodes;
                    for (var j=0, nodesLen=nodes.length; j<nodesLen; ++j)
                    {
                        if (!Firebug.shouldIgnore(nodes[j]))
                        {
                            refresh = true;
                            break;
                        }
                    }

                    if (!refresh)
                    {
                        nodes = record.removedNodes;
                        for (var j=0, nodesLen=nodes.length; j<nodesLen; ++j)
                        {
                            if (!Firebug.shouldIgnore(nodes[j]))
                            {
                                refresh = true;
                                break;
                            }
                        }
                    }
                    break;

                case "attributes":
                    if (!Firebug.shouldIgnore(record.target))
                        refresh = true;
                    break;

                case "characterData":
                    if (!Firebug.shouldIgnore(record.target.parentElement))
                        refresh = true;
                    break;
            }

            if (refresh)
                break;
        }

        if (refresh)
        {
            this.scrollTop = this.panelNode.getElementsByClassName("elementsGroups")[0].scrollTop;
            this.refresh();
        }
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
        this.onMutationObserve = this.onMutationObserve.bind(this);

        Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        var scrollContainer = this.panelNode.getElementsByClassName("elementsGroups")[0];
        state.scrollTop = scrollContainer.scrollTop ?
            scrollContainer.scrollTop : this.lastScrollTop;
        state.groups = this.groups;
        Persist.persistObjects(this, state);

        Panel.destroyNode.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        Panel.initializeNode.apply(this, arguments);

        Events.addEventListener(this.panelNode, "click", this.onClick, false);
    },

    destroyNode: function()
    {
        Panel.destroyNode.apply(this, arguments);

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
            if (state.scrollTop)
                this.scrollTop = state.scrollTop;

            if (state.groups)
                this.groups = state.groups;
        }

        this.refresh();

        this.observeMutations();
    },

    hide: function()
    {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
        this.lastScrollTop = this.panelNode.getElementsByClassName("elementsGroups")[0].scrollTop;
    },

    watchWindow: function(context, win)
    {
        this.observeMutations(win);
    },

    getEditor: function(target, value)
    {
        if (!this.editor)
            this.editor = new CSSSelectorsPanelEditor(this.document);

        return this.editor;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // General

    observeMutations: function(win)
    {
        var self = this;
        if (!self.mutationObserver)
            self.mutationObserver = new MutationObserver(this.onMutationObserve);

        function addObserver(win)
        {
            var doc = win.document;
            self.mutationObserver.observe(doc, {
                attributes: true,
                childList: true,
                characterData: true,
                subtree: true
            });
        }

        // If a window is specified, use it, otherwise register observers for all
        // context windows (including the main window and all embedded iframes).
        if (win)
            addObserver(win);
        else
            Win.iterateWindows(this.context.window, addObserver);
    },

    refresh: function()
    {
        var parentNode = this.template.selectorsTag.replace(
                {groups: this.groups, windows: this.context.windows}, this.panelNode);

        if (this.groups.length == 0)
        {
            var elementsGroups = parentNode.getElementsByClassName("elementsGroups")[0];
            var box = WarningTemplate.noSelectionTag.replace({}, elementsGroups);

            var readMore = box.getElementsByClassName("readMore")[0];
            FirebugReps.Description.render(Locale.$STR("css.selector.readMore"),
                readMore, Obj.bind(this.onReadMore, this));
        }
        else
        {
            for (var i=0, len=this.groups.length; i<len; ++i)
                this.displayGroup(this.groups[i]);
        }

        if (this.scrollTop)
        {
            this.panelNode.getElementsByClassName("elementsGroups")[0].scrollTop = this.scrollTop;
            delete this.scrollTop;
        }
    },

    onReadMore: function()
    {
        Win.openNewTab("https://getfirebug.com/wiki/index.php/Selectors_Side_Panel");
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

        this.displayGroup(group);
    },

    displayGroup: function(group)
    {
        var elementsGroups = this.panelNode.getElementsByClassName("elementsGroups")[0];
        var action = elementsGroups.getElementsByClassName("noSelection")[0] ?
            "replace" : "append";
        var elementsGroup = this.template.elementsGroupTag[action](
            {group: group, windows: this.context.windows}, elementsGroups);

        try
        {
            var elements = CSSSelectorsModule.matchElements(this.context.windows, group.selector);
            if (elements.length != 0)
            {
                this.template.elementsTag.append({elements: elements}, elementsGroup);
            }
            else
            {
                WarningTemplate.noSelectionResultsTag.append({}, elementsGroup);
            }
        }
        catch(e)
        {
            WarningTemplate.invalidSelectorTag.append({}, elementsGroup);
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
            var titleAtTop = offset.y < groupsNode.scrollTop;

            Dom.scrollTo(groupNode, groupsNode, null,
                groupNode.offsetHeight > groupsNode.clientHeight || titleAtTop ? "top" : "bottom");
        }
    },

    removeGroup: function(selector)
    {
        for (var i=0, len=this.groups.length; i<len; ++i)
        {
            if (this.groups[i].selector == selector)
            {
                this.groups.splice(i, 1);

                // Remove elements group from display
                var elementsGroup = this.panelNode.getElementsByClassName("elementsGroup")[i];
                elementsGroup.parentNode.removeChild(elementsGroup);
                break;
            }
        }
    }
});

function CSSSelectorsPanelEditor(doc)
{
    this.box = this.tag.replace({}, doc, this);
    this.input = this.box;

    SelectorEditor.prototype.initialize.call(this);
    this.tabNavigation = false;
    this.fixedWidth = true;
}

CSSSelectorsPanelEditor.prototype = domplate(SelectorEditor.prototype,
{
    tag:
        INPUT({"class": "fixedWidthEditor selectorsPanelEditor a11yFocusNoTab",
            type: "text",
            title: Locale.$STR("css.selector.tip.Selector"),
            oninput: "$onInput",
            onkeypress: "$onKeyPress"}
        ),

    saveEdit: function(target, value, previousValue)
    {
        var saveSuccess = this.isValidSelector(value);
        this.box.setAttribute("saveSuccess", saveSuccess);
    },

    endEditing: function(target, value, cancel)
    {
        if (cancel || value == "")
            return;

        this.panel.addGroup(value);
    },

    isValidSelector: function(value)
    {
        try
        {
            this.panel.panelNode.querySelector(value);
            return true;
        }
        catch (e)
        {
            return false;
        }
    }
});

// ********************************************************************************************* //

var WarningTemplate = domplate(Rep,
{
    noSelectionTag:
        DIV({"class": "selectorWarning noSelection"},
            DIV(Locale.$STR("css.selector.noSelection")),
            BR(),
            DIV({"class": "readMore"})
        ),

    noSelectionResultsTag:
        DIV({"class": "selectorWarning noSelectionResults"},
            SPAN(Locale.$STR("css.selector.noSelectionResults"))
        ),

    invalidSelectorTag:
        DIV({"class": "selectorWarning invalidSelector"},
            SPAN(Locale.$STR("css.selector.invalidSelector"))
        )
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(CSSSelectorsPanel);

return CSSSelectorsPanel;

// ********************************************************************************************* //
});
