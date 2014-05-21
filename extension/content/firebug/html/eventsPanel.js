/* See license.txt for terms of usage */
/*jshint esnext:true, curly:false, loopfunc:true*/
/*global Components:1, define:1, Element:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/locale",
    "firebug/chrome/menu",
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/lib/wrapper",
    "firebug/chrome/reps",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/script/sourceFile",
    "firebug/remoting/debuggerClient",
],
function(Firebug, FBTrace, Dom, Domplate, Events, Locale, Menu, Obj, Options, Wrapper, FirebugReps,
    DebuggerLib, SourceFile, DebuggerClient) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, DIV, FOR, TAG, H1, H2, SPAN} = Domplate;
var Cu = Components.utils;

var Trace = FBTrace.to("DBG_EVENTS");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Events Panel (HTML side panel)

function EventsPanel() {}

EventsPanel.prototype = Obj.extend(Firebug.Panel,
{
    name: "html-events",
    parentPanel: "html",
    enableA11y: true,
    order: 4,

    template: domplate(
    {
        cascadedTag:
            DIV(
                DIV({"class": "listenersNonInherited",
                        "aria-label": Locale.$STR("a11y.labels.event_listeners")},
                    TAG("$sectionTag", {object: "$element", list: "$own"})
                ),
                DIV({role: "list", "aria-label": Locale.$STR("a11y.labels.inherited_event_listeners")},
                    FOR("section", "$inherited",
                        DIV({"class": "listenerLabeledSection foldableGroup", $opened: "$section.opened"},
                            H1({"class": "listenerInheritHeader groupHeader focusRow",
                                    role: "listitem", "aria-expanded": "$section.opened"},
                                DIV({"class": "twisty", role: "presentation"}),
                                SPAN({"class": "listenerInheritLabel"}, "$section.label"),
                                TAG("$section.tag", {object: "$section.object"})
                            ),
                            TAG("$sectionTag", {object: "$section.object", list: "$section.list"})
                        )
                    )
                 )
            ),

        sectionTag:
            DIV({"class": "listenerSection", role: "group", _sectionTarget: "$object"},
                FOR("category", "$list",
                    TAG("$categoryTag", {category: "$category"})
                )
            ),

        categoryTag:
            DIV({"class": "listenerCategory foldableGroup opened"},
                H2({"class": "listenerCategoryHeader groupHeader focusRow",
                        role: "listitem", "aria-expanded": "true"},
                    DIV({"class": "twisty", role: "presentation"}),
                    SPAN({"class": "listenerCategoryLabel"}, "$category.type")
                ),
                FOR("listener", "$category.list",
                    TAG("$listenerTag", {listener: "$listener"})
                )
            ),

        listenerTag:
            DIV({"class": "listenerLineGroup focusRow", role: "listitem",
                    $disabled: "$listener.disabled", _listenerObject: "$listener",
                    "aria-checked": "$listener|checked"},
                DIV({"class": "listenerLine originalListener"},
                    SPAN({"class": "listenerIndent", role: "presentation"}),
                    TAG(FirebugReps.Func.tag, {object: "$listener.func"}),
                    SPAN({"class": "listenerCapturing", hidden: "$listener|capturingHidden"},
                        " " + Locale.$STR("events.capturing")),
                    TAG(FirebugReps.SourceLink.tag, {object: "$listener.sourceLink"})),
                FOR("wrappedListener", "$listener.wrappedListeners",
                    DIV({"class": "listenerLine wrappedListener"},
                        SPAN({"class": "listenerIndent", role: "presentation",
                            title: Locale.$STR("events.tip.wrappedFunction")}),
                        TAG(FirebugReps.Func.tag, {object: "$wrappedListener.func"}),
                        SPAN({"class": "selector", title: "$wrappedListener|getSelectorTooltip"},
                            "$wrappedListener|getSelectorText"),
                        TAG(FirebugReps.SourceLink.tag, {object: "$wrappedListener.sourceLink"}))
                )
            ),

        noOwnListenersTag:
            DIV({"class": "noOwnListenersText"}, "$text"),

        emptyTag: SPAN(),

        checked: (li) => String(!li.disabled),

        capturingHidden: function(listener)
        {
            return listener.capturing ? undefined : "";
        },

        getSelectorText: function(listener)
        {
            return listener.selector ? " (" + listener.selector + ")" : "";
        },

        getSelectorTooltip: function(listener)
        {
            return listener.selector ? Locale.$STR("events.tip.jQuerySelectorFilter") : undefined;
        },
    }),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        this.onClick = this.onClick.bind(this);
        Firebug.Panel.initialize.apply(this, arguments);
    },

    initializeNode: function()
    {
        Firebug.Panel.initializeNode.apply(this, arguments);
        Events.addEventListener(this.panelNode, "click", this.onClick, false);
        DebuggerClient.addListener(this);
    },

    destroyNode: function()
    {
        DebuggerClient.removeListener(this);
        Events.removeEventListener(this.panelNode, "click", this.onClick, false);
        Firebug.Panel.destroyNode.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    isDebuggerEnabled: function()
    {
        return this.context.isPanelEnabled("script") && this.context.activeThread;
    },

    shouldShowWrappedListeners: function()
    {
        return Options.get("showWrappedListeners") && this.isDebuggerEnabled();
    },

    updateOption: function(name)
    {
        if (name === "showWrappedListeners")
            this.refresh();
    },

    updateSelection: function(selection)
    {
        if (!(selection instanceof Element))
            return;
        Trace.sysout("events.updateSelection; " + selection.localName);

        try
        {
            var own = this.getOwnSection(selection);
            var inherited = this.getInheritedSections(selection);
            this.template.cascadedTag.replace({element: selection, own: own, inherited: inherited},
                this.panelNode);

            var firstSection = this.panelNode.getElementsByClassName("listenerSection")[0];
            if (!firstSection.firstChild)
            {
                var text = Locale.$STR("events.noEventListeners");
                this.template.noOwnListenersTag.replace({text: text}, firstSection);
            }
        }
        catch (exc)
        {
            TraceError.sysout("events.updateSelection FAILS", exc);
        }
    },

    onThreadAttached: function()
    {
        // Refresh the panel if the debugger becomes enabled, so we get source links.
        if (this.context.sidePanelName === this.name)
            this.refresh();
    },

    getDisabledMap: function(context)
    {
        if (!context.listenerDisabledMap)
            context.listenerDisabledMap = new WeakMap();
        return context.listenerDisabledMap;
    },

    getWrappedListeners: function(listener)
    {
        // Try to see if the listener (often from a library) wraps another user-defined
        // listener, and if so extract the user-defined listener(s). We do this through
        // pattern-matching on function calls that go through call or apply, which are
        // often used to set 'this' to something which is reasonable from a library user's
        // point of view, but are rather uncommon outside of library code. We then use
        // debugger magic to extract the original functions from the listener's closure.
        var func = listener.func;
        var src = String(func);
        var mIndirection = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\.(call|apply)/.exec(src);
        if (!mIndirection)
            return null;
        var funcName = mIndirection[1];

        var global = Cu.getGlobalForObject(func);
        var dbgGlobal = DebuggerLib.getThreadDebuggeeGlobalForContext(this.context, global);
        var dbgFunc = dbgGlobal && dbgGlobal.makeDebuggeeValue(func);
        var dbgEnv = dbgFunc && dbgFunc.environment;
        if (!dbgEnv)
            return null;

        if (src.charAt(mIndirection.index - 1) === ".")
        {
            // Not a direct call; bail. Before we give up entirely, try one last special case:
            // jQuery. For reasons of old-IE compat and extensibility, jQuery (and only jQuery)
            // stores all event listeners in a data structure separated from the closure of the
            // listener function. We special-case it only because it is so common.
            var target = listener.target;
            var type = listener.type;
            return this.getWrappedJqueryListeners(target, type, dbgEnv, funcName, src);
        }

        dbgEnv = dbgEnv.find(funcName);
        if (!dbgEnv || !dbgEnv.parent)
            return null;
        var dbgWrappedF = dbgEnv.getVariable(funcName);
        var wrappedF = DebuggerLib.unwrapDebuggeeValue(dbgWrappedF);
        if (typeof wrappedF !== "function")
            return null;
        return [{func: wrappedF}];
    },

    getWrappedJqueryListeners: function(target, type, dbgEnv, funcName, src)
    {
        if (funcName !== "handle" && funcName !== "dispatch")
            return null;
        try
        {
            // Pattern match on the occurance of '<minified name>.event.<funcName>.apply'.
            var matches = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\.event\.(dispatch|handle)\.apply/.exec(src);
            var jqName = (matches && matches[1]) || "";
            dbgEnv = dbgEnv.find(jqName);
            var dbgJq = dbgEnv && dbgEnv.getVariable(jqName);
            if (!dbgJq)
                return null;

            var jq = DebuggerLib.unwrapDebuggeeValue(dbgJq);
            var eventData = jq._data(target, "events");
            var listeners = eventData && eventData[type];
            if (!listeners)
                return null;

            var ret = [];
            for (var i = 0; i < listeners.length; i++)
            {
                let e = listeners[i];
                let listener = {
                    func: e.origHandler || e.handler
                };
                if (typeof listener.func !== "function")
                    continue;

                let selector = e.selector;
                if (typeof selector === "string")
                {
                    var needsContext = e.needsContext;
                    listener.selector = selector;
                    listener.appliesToElement = (element) =>
                        this.jQueryListenerApplies(jq, target, selector, needsContext, element);
                }
                ret.push(listener);
            }
            return ret;
        }
        catch (exc)
        {
            Trace.sysout("events.getWrappedJqueryListeners threw an error", exc);
            return null;
        }
    },

    jQueryListenerApplies: function(jq, target, selector, needsContext, element)
    {
        try
        {
            // Only show this listener if jQuery runs it on this node, i.e., if the
            // element or some ancestor of it matches the listener selector.
            var global = Cu.getGlobalForObject(jq);
            var elements = new global.Array(), elementSet = new Set();
            var cur = element;
            while (cur)
            {
                elements.push(cur);
                elementSet.add(cur);
                cur = cur.parentNode;
            }

            var matches;
            if (needsContext)
            {
                // Handle selectors like "> a" (for versions >= 1.9).
                matches = jq(selector, target).filter(function()
                {
                    return elementSet.has(this);
                });
            }
            else
            {
                matches = jq.find(selector, target, null, elements);
            }

            return (matches.length > 0);
        }
        catch (exc)
        {
            Trace.sysout("events.jQueryListenerApplies threw an error", exc);
            return true;
        }
    },

    getNormalEventListeners: function(target)
    {
        var context = this.context;
        var listeners = Events.getEventListenersForTarget(target);
        var hasOneHandler = new Set();
        listeners = listeners.filter((li) => li.func !== null);
        listeners.forEach((li) =>
        {
            li.disabled = false;
            li.target = target;
            li.sourceLink = SourceFile.findSourceForFunction(li.func, context);

            var handlerName = "on" + li.type;
            li.isEventHandler = (target[handlerName] === li.listenerObject &&
                !hasOneHandler.has(handlerName) && !li.capturing &&
                handlerName in Object.getPrototypeOf(target));

            if (this.shouldShowWrappedListeners())
            {
                var wrapped = this.getWrappedListeners(li) || [];
                li.wrappedListeners = wrapped.map(function(listener)
                {
                    return {
                        func: listener.func,
                        appliesToElement: listener.appliesToElement,
                        selector: listener.selector,
                        sourceLink: SourceFile.findSourceForFunction(listener.func, context)
                    };
                });
            }

            if (li.isEventHandler)
            {
                // Inline event handler
                hasOneHandler.add(handlerName);
                li.enable = function()
                {
                    target[handlerName] = li.func;
                };
                li.disable = function()
                {
                    target[handlerName] = null;
                };
            }
            else
            {
                // Standard event listener
                var args = [li.type, li.listenerObject, li.capturing, li.allowsUntrusted];
                li.enable = function()
                {
                    target.addEventListener.apply(target, args);
                };
                li.disable = function()
                {
                    target.removeEventListener.apply(target, args);
                };
            }
        });
        return listeners;
    },

    getListeners: function(target)
    {
        var normal = this.getNormalEventListeners(target);
        var disabled = this.getDisabledMap(this.context).get(target, []);

        // Try to insert the disabled listeners at their previous positions. This will be
        // wrong in case listeners have been removed since those positions were recorded,
        // but hopefully that should happen only rarely.
        var ret = [];
        var normalInd = 0, disabledInd = 0;
        for (var i = 0; i < normal.length + disabled.length; i++)
        {
            var useDisabled = (normalInd === normal.length ||
                (disabledInd < disabled.length && disabled[disabledInd].index === i));
            var li;
            if (useDisabled)
                li = disabled[disabledInd++];
            else
                li = normal[normalInd++];
            li.index = i;
            ret.push(li);
        }
        return ret;
    },

    getOwnSection: function(element)
    {
        return categorizeListenerList(this.getListeners(element));
    },

    getInheritedSections: function(baseElement)
    {
        var ret = [];
        var context = this.context;
        var emptyTag = this.template.emptyTag;
        function addSection(object, list, inherits)
        {
            if (!list.length)
                return;

            var inherited = (inherits && object !== baseElement);
            var label = inherited ?
                Locale.$STR("events.listenersFrom") :
                Locale.$STR("events.otherListeners");
            var tag;
            if (typeof object === "string")
            {
                label = object;
                tag = emptyTag;
            }
            else
            {
                var rep = Firebug.getRep(object, context);
                tag = rep.shortTag || rep.tag;
            }

            for (let listener of list)
            {
                if (!listener.wrappedListeners)
                    continue;
                var wrapped = [];
                for (let li of listener.wrappedListeners)
                {
                    // For non-inherited listeners, filtering by the current node
                    // doesn't make sense.
                    if (inherits && li.appliesToElement)
                    {
                        if (!li.appliesToElement(baseElement))
                            continue;
                    }
                    else
                    {
                        li.selector = "";
                    }
                    wrapped.push(li);
                }
                listener.wrappedListeners = wrapped;
            }

            ret.push({
                label: label,
                tag: tag,
                object: object,
                list: categorizeListenerList(list),
                opened: inherits
            });
        }

        var element = baseElement.parentElement;
        while (element)
        {
            var added = this.getListeners(element).filter(function(listener)
            {
                return Events.eventTypeBubbles(listener.type);
            });
            addSection(element, added, true);
            element = element.parentElement;
        }

        // Add special "document" and "window" sections, split into two parts:
        // the ones that are part of event bubbling and the ones that are not.

        var doc = baseElement.ownerDocument, docInherited = [], docOwn = [];
        if (doc)
        {
            for (let listener of this.getListeners(doc))
            {
                if (Events.eventTypeBubblesToDocument(listener.type))
                    docInherited.push(listener);
                else
                    docOwn.push(listener);
            }
        }

        var win = doc && doc.defaultView, winInherited = [], winOwn = [];
        if (win)
        {
            for (let listener of this.getListeners(win))
            {
                if (Events.eventTypeBubblesToDocument(listener.type))
                    winInherited.push(listener);
                else
                    winOwn.push(listener);
            }
        }

        addSection(doc, docInherited, true);
        addSection(win, winInherited, true);
        addSection(doc, docOwn, false);
        addSection(win, winOwn, false);
        return ret;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    toggleDisableRow: function(row)
    {
        var listener = row.listenerObject;
        var shouldDisable = !listener.disabled;
        listener.disabled = shouldDisable;

        if (shouldDisable)
            row.classList.add("disabled");
        else
            row.classList.remove("disabled");
        row.setAttribute("aria-checked", String(!shouldDisable));

        var target = listener.target;
        var disabledMap = this.getDisabledMap(this.context);
        if (!disabledMap.has(target))
            disabledMap.set(target, []);
        var map = disabledMap.get(target);

        if (shouldDisable)
        {
            map.push(listener);
            listener.disable();
        }
        else
        {
            var index = map.indexOf(listener);
            map.splice(index, 1);

            // Disable and enable all event listeners at higher indices, so that the listener
            // gets inserted in the correct place. Fetch the listener list again for this, so
            // that we don't accidentally enable any listeners that were removed after the UI
            // was created. (This could end up inserting the listener a few positions earlier
            // than wanted if listeners are removed before it, but that should be uncommon
            // and it's not a big deal.)
            var listenerSection = Dom.getAncestorByClass(row, "listenerSection");
            var lineGroups = listenerSection.getElementsByClassName("listenerLineGroup");
            var knownListeners = [].map.call(lineGroups, (gr) => gr.listenerObject);
            var actualListeners = this.getNormalEventListeners(target);

            var normalInd = 0;
            for (let li of knownListeners)
            {
                if (li === listener)
                    break;
                if (!li.disabled)
                    normalInd++;
            }

            listener.enable();
            for (var i = normalInd; i < actualListeners.length; i++)
            {
                actualListeners[i].disable();
                actualListeners[i].enable();
            }
        }
    },

    // XXX(simon): This is almost identical to code in css/computedPanel, css/selectorPanel,
    // and debugger/breakpoints/breakpointReps - we should share it somehow.
    toggleGroup: function(header)
    {
        var node = header.parentNode;
        node.classList.toggle("opened");

        if (node.classList.contains("opened"))
        {
            header.setAttribute("aria-expanded", "true");
            var offset = Dom.getClientOffset(node);
            var titleAtTop = offset.y < this.panelNode.scrollTop;

            Dom.scrollTo(node, this.panelNode, null,
                node.offsetHeight > this.panelNode.clientHeight || titleAtTop ? "top" : "bottom");
        }
        else
        {
            header.setAttribute("aria-expanded", "false");
        }
    },

    refresh: function()
    {
        this.updateSelection(this.selection);
    },

    onClick: function(event)
    {
        var target = event.target;
        if (!Events.isLeftClick(event))
            return;

        var header = Dom.getAncestorByClass(target, "groupHeader");
        if (header && !Dom.getAncestorByClass(target, "objectLink"))
        {
            this.toggleGroup(header);
            Events.cancelEvent(event);
        }
        else if (target.classList.contains("listenerIndent") &&
            target.parentNode.classList.contains("originalListener"))
        {
            var row = Dom.getAncestorByClass(target, "listenerLineGroup");
            this.toggleDisableRow(row);
            Events.cancelEvent(event);
        }
    },

    getOptionsMenuItems: function()
    {
        var label = Locale.$STR("events.option.showWrappedListeners");
        var tooltip = Locale.$STR("events.option.tip.showWrappedListeners");
        tooltip = Locale.$STRF("script.Script_panel_must_be_enabled", [tooltip]);
        var menuItem = Menu.optionMenu(label, "showWrappedListeners", tooltip);
        menuItem.nol10n = true;
        menuItem.disabled = !this.isDebuggerEnabled();

        return [
            menuItem,
            "-",
            {
                label: "Refresh",
                tooltiptext: "panel.tip.Refresh",
                command: this.refresh.bind(this)
            }
        ];
    },

    getContextMenuItems: function(object)
    {
        if (object)
            return;
        return [
            {
                label: "Refresh",
                tooltiptext: "panel.tip.Refresh",
                command: this.refresh.bind(this)
            }
        ];
    },
});

// ********************************************************************************************* //
// Helpers


function categorizeListenerList(list)
{
    var map = new Map(), keys = [];
    for (let ev of list)
    {
        let type = ev.type;
        if (!map.has(type))
        {
            map.set(type, []);
            keys.push(type);
        }
        map.get(type).push(ev);
    }
    keys.sort();

    var ret = [];
    for (let type of keys)
    {
        ret.push({
            type: type,
            list: map.get(type)
        });
    }
    return ret;
}

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(EventsPanel);

return EventsPanel;

// ********************************************************************************************* //
});
