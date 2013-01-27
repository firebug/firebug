/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/js/sourceLink",
    "firebug/js/stackFrame",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/search",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/lib/persist",
    "firebug/console/closureInspector",
    "firebug/dom/toggleBranch",
    "firebug/lib/system",
    "firebug/chrome/menu",
    "firebug/editor/editor",
    "firebug/js/breakpoint",
    "firebug/chrome/searchBox",
    "firebug/dom/domModule",
    "firebug/console/autoCompleter"
],
function(Obj, Firebug, Domplate, FirebugReps, Locale, Events, Wrapper, SourceLink, StackFrame,
    Dom, Css, Search, Str, Arr, Persist, ClosureInspector, ToggleBranch, System, Menu) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const jsdIStackFrame = Ci.jsdIStackFrame;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

const insertSliceSize = 18;
const insertInterval = 40;

const rxIdentifier = /^[$_A-Za-z][$_A-Za-z0-9]*$/;

// ********************************************************************************************* //

const WatchRowTag =
    TR({"class": "watchNewRow", level: 0},
        TD({"class": "watchEditCell", colspan: 3},
            DIV({"class": "watchEditBox a11yFocusNoTab", role: "button", tabindex: "0",
                "aria-label": Locale.$STR("a11y.labels.press enter to add new watch expression")},
                    Locale.$STR("NewWatch")
            )
        )
    );

const SizerRow =
    TR({role: "presentation"},
        TD(),
        TD({width: "30%"}),
        TD({width: "70%"})
    );

const DirTablePlate = domplate(Firebug.Rep,
{
    memberRowTag:
        TR({"class": "memberRow $member.open $member.type\\Row", _domObject: "$member",
            $hasChildren: "$member.hasChildren",
            role: "presentation",
            level: "$member.level",
            breakable: "$member.breakable",
            breakpoint: "$member.breakpoint",
            disabledBreakpoint: "$member.disabledBreakpoint"},
            TD({"class": "memberHeaderCell"},
               DIV({"class": "sourceLine memberRowHeader", onclick: "$onClickRowHeader"},
                   "&nbsp;"
               )
            ),
            TD({"class": "memberLabelCell", style: "padding-left: $member.indent\\px",
                role: "presentation"},
                DIV({"class": "memberLabel $member.type\\Label", title: "$member.title"},
                    SPAN({"class": "memberLabelPrefix"}, "$member.prefix"),
                    SPAN({title: "$member|getMemberNameTooltip"}, "$member.name")
                )
            ),
            TD({"class": "memberValueCell", $readOnly: "$member.readOnly",
                role: "presentation"},
                TAG("$member.tag", {object: "$member.value"})
            )
        ),

    tag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick",
            _repObject: "$object", role: "tree",
            "aria-label": Locale.$STR("aria.labels.dom properties")},
            TBODY({role: "presentation"},
                SizerRow,
                FOR("member", "$object|memberIterator",
                    TAG("$memberRowTag", {member: "$member"})
                )
            )
        ),

    watchTag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0,
               _toggles: "$toggles", _domPanel: "$domPanel", onclick: "$onClick", role: "tree"},
            TBODY({role: "presentation"},
                SizerRow,
                WatchRowTag
            )
        ),

    tableTag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0,
            _toggles: "$toggles", _domPanel: "$domPanel", onclick: "$onClick",
            role: "tree", "aria-label": Locale.$STR("a11y.labels.dom_properties")},
            TBODY({role: "presentation"},
                SizerRow
            )
        ),

    rowTag:
        FOR("member", "$members",
            TAG("$memberRowTag", {member: "$member"})
        ),

    memberIterator: function(object)
    {
        var members = Firebug.DOMBasePanel.prototype.getMembers(object, 0, null);
        if (members.length)
            return members;

        return [{
            name: Locale.$STR("firebug.dom.noChildren2"),
            type: "string",
            rowClass: "memberRow-string",
            tag: Firebug.Rep.tag,
            prefix: ""
        }];
    },

    getMemberNameTooltip: function(member)
    {
        return member.title || member.scopeNameTooltip;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onClick: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        var row = Dom.getAncestorByClass(event.target, "memberRow");
        var label = Dom.getAncestorByClass(event.target, "memberLabel");
        var valueCell = row.getElementsByClassName("memberValueCell").item(0);
        var object = Firebug.getRepObject(event.target);
        var target = row.lastChild.firstChild;
        var isString = Css.hasClass(target,"objectBox-string");
        var inValueCell = event.target == valueCell || event.target == target;

        if (label && Css.hasClass(row, "hasChildren") && !(isString && inValueCell))
        {
            var row = label.parentNode.parentNode;
            this.toggleRow(row);
            Events.cancelEvent(event);
        }
        else
        {
            if (typeof(object) == "function")
            {
                Firebug.chrome.select(object, "script");
                Events.cancelEvent(event);
            }
            else if (Events.isDoubleClick(event) && !object)
            {
                var panel = row.parentNode.parentNode.domPanel;
                if (panel)
                {
                    // XXX this should use member.value
                    var rowValue = panel.getRowPropertyValue(row);
                    if (typeof rowValue == "boolean")
                        panel.setPropertyValue(row, ""+!rowValue);
                    else
                        panel.editProperty(row);
                    Events.cancelEvent(event);
                }
            }
        }
    },

    toggleRow: function(row)
    {
        var level = parseInt(row.getAttribute("level"), 10);
        var table = Dom.getAncestorByClass(row, "domTable");
        var toggles = table.toggles;
        if (!toggles)
            toggles = table.repObject.toggles;

        var domPanel = table.domPanel;
        if (!domPanel)
        {
            var panel = Firebug.getElementPanel(row);
            domPanel = panel.context.getPanel("dom");
        }

        if (!domPanel)
            return;

        var context = domPanel.context;
        var target = row.lastChild.firstChild;
        var isString = Css.hasClass(target, "objectBox-string");

        if (Css.hasClass(row, "opened"))
        {
            Css.removeClass(row, "opened");

            if (isString)
            {
                var rowValue = row.domObject.value;
                row.lastChild.firstChild.textContent = '"' + Str.cropMultipleLines(rowValue) + '"';
            }
            else
            {
                if (toggles)
                {
                    var path = getPath(row);

                    // Remove the path from the toggle tree
                    for (var i = 0; i < path.length; ++i)
                    {
                        if (i == path.length-1)
                            toggles.remove(path[i]);
                        else
                            toggles = toggles.get(path[i]);
                    }
                }

                var rowTag = this.rowTag;
                var tbody = row.parentNode;

                setTimeout(function()
                {
                    for (var firstRow = row.nextSibling; firstRow; firstRow = row.nextSibling)
                    {
                        if (parseInt(firstRow.getAttribute("level"), 10) <= level)
                            break;

                        tbody.removeChild(firstRow);
                    }
                }, row.insertTimeout ? row.insertTimeout : 0);
            }
        }
        else
        {
            Css.setClass(row, "opened");
            if (isString)
            {
                var rowValue = row.domObject.value;
                row.lastChild.firstChild.textContent = '"' + rowValue + '"';
            }
            else
            {
                if (toggles)
                {
                    var path = getPath(row);

                    // Mark the path in the toggle tree
                    for (var i = 0; i < path.length; ++i)
                    {
                        var name = path[i];
                        if (toggles.get(name))
                            toggles = toggles.get(name);
                        else
                            toggles = toggles.set(name, new ToggleBranch.ToggleBranch());
                    }
                    if (FBTrace.DBG_DOMPLATE)
                        FBTrace.sysout("toggleRow mark path "+toggles);
                }

                var members = domPanel.getMembers(target.repObject, level+1, context);

                var rowTag = this.rowTag;
                var lastRow = row;

                var delay = 0;
                var setSize = members.length;
                var rowCount = 1;
                while (members.length)
                {
                    with ({slice: members.splice(0, insertSliceSize), isLast: !members.length})
                    {
                        setTimeout(function()
                        {
                            if (lastRow.parentNode)
                            {
                                var result = rowTag.insertRows({members: slice}, lastRow);
                                lastRow = result[1];
                                Events.dispatch(Firebug.DOMModule.fbListeners,
                                    "onMemberRowSliceAdded", [null, result, rowCount, setSize]);
                                rowCount += insertSliceSize;
                            }

                            if (isLast)
                                delete row.insertTimeout;
                        }, delay);
                    }

                    delay += insertInterval;
                }

                row.insertTimeout = delay;
            }
        }
    },

    onClickRowHeader: function(event)
    {
        Events.cancelEvent(event);

        var rowHeader = event.target;
        if (!Css.hasClass(rowHeader, "memberRowHeader"))
            return;

        var row = Dom.getAncestorByClass(event.target, "memberRow");
        if (!row)
            return;

        var panel = row.parentNode.parentNode.domPanel;
        if (panel)
        {
            var scriptPanel = panel.context.getPanel("script", true);
            if (!scriptPanel || !scriptPanel.isEnabled())
                return;     // set the breakpoint only if the script panel will respond.
            panel.breakOnProperty(row);
        }
    }
});

const ToolboxPlate = domplate(
{
    tag:
        DIV({"class": "watchToolbox", _domPanel: "$domPanel", onclick: "$onClick"},
            IMG({"class": "watchDeleteButton closeButton", src: "blank.gif"})
        ),

    onClick: function(event)
    {
        var toolbox = event.currentTarget;
        toolbox.domPanel.deleteWatch(toolbox.watchRow);
    }
});

// ********************************************************************************************* //

Firebug.DOMBasePanel = function() {};

Firebug.DOMBasePanel.ToolboxPlate = ToolboxPlate;

Firebug.DOMBasePanel.prototype = Obj.extend(Firebug.Panel,
{
    tag: DirTablePlate.tableTag,
    dirTablePlate: DirTablePlate,

    getObjectView: function(object)
    {
        if (!Firebug.viewChrome)
        {
            // Unwrap native, wrapped objects.
            var contentView = Wrapper.getContentView(object);
            if (contentView)
                return contentView;
        }
        return object;
    },

    rebuild: function(update, scrollTop)
    {
        Events.dispatch(this.fbListeners, "onBeforeDomUpdateSelection", [this]);

        var members = this.getMembers(this.selection, 0, this.context);
        this.expandMembers(members, this.toggles, 0, 0, this.context);
        this.showMembers(members, update, scrollTop);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Object properties

    /**
     * Returns a list of properties available on an object, filtered on enumerability and prototype
     * chain position. Due to prototype traversal, some property names may appear several times.
     *
     * @param {Object} object The object we want to get the list of properties for.
     * @param {Boolean} enumerableOnly If set to true, only enumerable properties are returned.
     * @param {Boolean} ownOnly If set to true, only own properties (not those from the
     *      prototype chain) are returned.
     */
    getObjectProperties: function(object, enumerableOnly, ownOnly)
    {
        var props = [];

        // Get all enumerable-only or all-properties of the object (but not inherited).
        if (enumerableOnly)
            props = Object.keys(object);
        else
            props = Object.getOwnPropertyNames(object);

        // Not interested in inherited properties, bail out.
        if (ownOnly)
            return props;

        // Climb the prototype chain.
        var inheritedProps = [];
        var parent = Object.getPrototypeOf(object);
        if (parent)
            inheritedProps = this.getObjectProperties(parent, enumerableOnly, ownOnly);

        // Push everything onto the returned array, to avoid O(nm) runtime behavior.
        inheritedProps.push.apply(inheritedProps, props);
        return inheritedProps;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * @param object a user-level object wrapped in security blanket
     * @param level for a.b.c, level is 2
     * @param optional context
     */
    getMembers: function(object, level, context)
    {
        if (!level)
            level = 0;

        var ordinals = [];
        var userProps = [];
        var userClasses = [];
        var userFuncs = [];
        var domProps = [];
        var domClasses = [];
        var domFuncs = [];
        var domConstants = [];
        var proto = [];
        var domHandlers = [];

        var isScope = ClosureInspector.isScopeWrapper(object);

        try
        {
            // Special case for "arguments", which is not enumerable by for...in statement.
            if (isArguments(object))
                object = Arr.cloneArray(object);

            try
            {
                // Make sure not to touch the prototype chain of the magic scope objects.
                var ownOnly = Firebug.showOwnProperties || isScope;
                var enumerableOnly = Firebug.showEnumerableProperties;

                var contentView = this.getObjectView(object);
                var properties = this.getObjectProperties(contentView, enumerableOnly, ownOnly);
                properties = Arr.sortUnique(properties);

                var addOwn = function(prop)
                {
                    // Apparently, Object.prototype.hasOwnProperty.call(contentView, p) lies
                    // when 'contentView' is content and 'Object' is chrome... Bug 658909?
                    if (Object.getOwnPropertyDescriptor(contentView, prop) &&
                        properties.indexOf(prop) === -1)
                    {
                        properties.push(prop);
                    }
                };
                addOwn("constructor");
                addOwn("prototype");
                addOwn("wrappedJSObject");

                // __proto__ never shows in enumerations, so add it here. We currently
                // we don't want it when only showing own properties.
                if (contentView.__proto__ && Obj.hasProperties(contentView.__proto__) &&
                    properties.indexOf("__proto__") == -1 && !Firebug.showOwnProperties)
                {
                    properties.push("__proto__");
                }
            }
            catch (exc)
            {
                if (FBTrace.DBG_ERRORS || FBTrace.DBG_DOM)
                    FBTrace.sysout("dom.getMembers: property lookups failed", exc);

                // workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=648560
                // XXX can't reproduce, and it's at most relevant to Chromebug.
                /*
                if (contentView.wrappedJSObject)
                {
                    if (FBTrace.DBG_ERRORS || FBTrace.DBG_DOM)
                    {
                        FBTrace.sysout("dom DOM bz:" + (XPCNativeWrapper.unwrap(contentView) !==
                            contentView) + " contentView(" + contentView + ").wrappedJSObject " +
                            contentView.wrappedJSObject);
                    }

                    var wrapperToString = contentView+"";
                    contentView =
                    {
                        wrappedJSObject: XPCNativeWrapper.unwrap(contentView),
                        toString: function() { return wrapperToString; },
                        isXPCNativeWrapper: (XPCNativeWrapper.unwrap(contentView) !== contentView),
                    };

                    object = contentView;
                }
                */
            }

            var name, val;
            var add = function(type, where, order)
            {
                this.addMember(object, type, where, name, val, level, order || 0, context, isScope);
            }.bind(this);

            var domMembers = Dom.getDOMMembers(object);
            for (var i = 0; i < properties.length; i++)
            {
                name = properties[i];

                // Ignore only global variables (properties of the |window| object).
                if (Wrapper.shouldIgnore(name) && (object instanceof Window))
                {
                    if (FBTrace.DBG_DOM)
                    {
                        FBTrace.sysout("dom.getMembers: Wrapper.ignoreVars: " + name + ", " +
                            level, object);
                    }
                    continue;
                }

                try
                {
                    val = contentView[name];
                }
                catch (exc)
                {
                    // Sometimes we get exceptions trying to access certain members
                    if (FBTrace.DBG_ERRORS && FBTrace.DBG_DOM)
                        FBTrace.sysout("dom.getMembers cannot access "+name, exc);

                    val = undefined;
                }

                if (!isNaN(parseInt(name, 10)))
                {
                    add("ordinal", ordinals, 0);
                }
                else if (typeof val === "function")
                {
                    var classFunc = isClassFunction(val);
                    var domMember = Dom.isDOMMember(object, name);
                    if (domMember && classFunc)
                    {
                        add("domClass", domClasses, domMembers[name]);
                    }
                    else if (domMember)
                    {
                        add("domFunction", domFuncs, domMembers[name]);
                    }
                    else if (classFunc)
                    {
                        add("userClass", userClasses);
                    }
                    else if (!Firebug.showUserFuncs && Firebug.showInlineEventHandlers &&
                        Dom.isInlineEventHandler(name))
                    {
                        add("userFunction", domHandlers);
                    }
                    else
                    {
                        add("userFunction", userFuncs);
                    }
                }
                else
                {
                    if (isPrototype(name))
                    {
                        add("proto", proto);
                    }
                    else if (Dom.isDOMMember(object, name))
                    {
                        add("dom", domProps, domMembers[name]);
                    }
                    else if (Dom.isDOMConstant(object, name))
                    {
                        add("dom", domConstants);
                    }
                    else if (Dom.isInlineEventHandler(name))
                    {
                        add("user", domHandlers);
                    }
                    else
                    {
                        add("user", userProps);
                    }
                }
            }

            if (isScope || (typeof object === "function" && Firebug.showClosures && context))
            {
                this.maybeAddClosureMember(object, "proto", proto, level, context, isScope);
            }
        }
        catch (exc)
        {
            // Sometimes we get exceptions just from trying to iterate the members
            // of certain objects, like StorageList, but don't let that gum up the works
            if (FBTrace.DBG_DOM)
                FBTrace.sysout("dom.getMembers FAILS: ", exc);
        }

        function sortName(a, b) { return a.name > b.name ? 1 : -1; }
        function sortOrdinal(a, b) { return parseInt(a.name) > parseInt(b.name) ? 1 : -1; }

        var members = [];

        ordinals.sort(sortOrdinal);
        members.push.apply(members, ordinals);

        if (Firebug.showUserProps)
        {
            userProps.sort(sortName);
            members.push.apply(members, userProps);
        }

        if (Firebug.showUserFuncs)
        {
            userClasses.sort(sortName);
            members.push.apply(members, userClasses);

            userFuncs.sort(sortName);
            members.push.apply(members, userFuncs);
        }

        if (Firebug.showDOMProps)
        {
            domProps.sort(sortName);
            members.push.apply(members, domProps);
        }

        if (Firebug.showDOMFuncs)
        {
            domClasses.sort(sortName);
            members.push.apply(members, domClasses);

            domFuncs.sort(sortName);
            members.push.apply(members, domFuncs);
        }

        if (Firebug.showDOMConstants)
            members.push.apply(members, domConstants);

        members.push.apply(members, proto);

        if (Firebug.showInlineEventHandlers)
        {
            domHandlers.sort(sortName);
            members.push.apply(members, domHandlers);
        }

        if (FBTrace.DBG_DOM)
        {
            var showEnum = Firebug.showEnumerableProperties;
            var showOwn = Firebug.showOwnProperties;
            FBTrace.sysout("dom.getMembers; Report: enum-only: " + showEnum +
                ", own-only: " + showOwn,
            {
                object: object,
                ordinals: ordinals,
                userProps: userProps,
                userFuncs: userFuncs,
                userClasses: userClasses,
                domProps: domProps,
                domFuncs: domFuncs,
                domConstants: domConstants,
                domHandlers: domHandlers,
                proto: proto,
            });
        }

        return members;
    },

    addMember: function()
    {
        try
        {
            return this.addMemberInternal.apply(this, arguments);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("domPanel.addMember; EXCEPTION " + err, err);
        }
    },

    addMemberInternal: function(object, type, props, name, value, level, order, context, parentIsScope)
    {
        // Do this first in case a call to instanceof (= QI, for XPCOM things) reveals contents.
        var rep = Firebug.getRep(value);
        var tag = rep.shortTag ? rep.shortTag : rep.tag;

        var hasProperties = Obj.hasProperties(value, !Firebug.showEnumerableProperties,
            Firebug.showOwnProperties);

        var valueType = typeof value;
        var hasChildren = hasProperties && !(value instanceof FirebugReps.ErrorCopy) &&
            ((valueType == "function") ||
             (valueType == "object" && value != null) ||
             (valueType == "string" && value.length > Firebug.stringCropLength));

        // Special case for closure inspection.
        if (!hasChildren && valueType === "function" && Firebug.showClosures && context)
        {
            try
            {
                var win = context.baseWindow || context.window;
                ClosureInspector.getEnvironmentForObject(win, value, context);
                hasChildren = true;
            }
            catch (e) {}
        }

        // Special case for "arguments", which is not enumerable by for...in statement
        // and so, Obj.hasProperties always returns false.
        hasChildren = hasChildren || (!!value && isArguments(value));

        if (valueType === "function" && !hasChildren)
        {
            try
            {
                // Special case for functions with a prototype that has values
                var proto = value.prototype;
                if (proto)
                {
                    hasChildren = Obj.hasProperties(proto, !Firebug.showEnumerableProperties,
                        Firebug.showOwnProperties);
                }
            }
            catch (exc) {}
        }

        var descriptor = getPropertyDescriptor(object, name);

        var member = {
            object: object,
            name: name,
            value: value,
            type: type,
            rowClass: "memberRow-"+type,
            open: "",
            order: order,
            level: level,
            indent: level*16,
            hasChildren: hasChildren,
            tag: tag,
            prefix: "",
            readOnly: (descriptor && !descriptor.writable && !descriptor.set),
            // XXX should probably move the tests from getContextMenuItems here
            deletable: (!parentIsScope && !(descriptor && !descriptor.configurable))
        };

        // The context doesn't have to be specified (e.g. in case of Watch panel that is based
        // on the same template as the DOM panel, but doesn't show any breakpoints).
        if (context)
        {
            // xxxHonza: Support for object change not implemented yet.
            member.breakable = !hasChildren && !parentIsScope;

            var breakpoints = context.dom.breakpoints;
            var bp = breakpoints.findBreakpoint(object, name);
            if (bp)
            {
                member.breakpoint = true;
                member.disabledBreakpoint = !bp.checked;
            }
        }

        if (parentIsScope)
            member.scopeNameTooltip = Locale.$STRF("dom.tip.scopeMemberName", ["%" + name]);

        // Set prefix for user defined properties. This prefix help the user to distinguish
        // among simple properties and those defined using getter and/or (only a) setter.
        // XXX This should be rewritten to use 'descriptor', and I believe the unwrapping
        // test is wrong (see issue 5377).
        var o = this.getObjectView(object);
        if (o && !Dom.isDOMMember(object, name) && (XPCNativeWrapper.unwrap(object) !== object))
        {
            var getter = o.__lookupGetter__(name);
            var setter = o.__lookupSetter__(name);

            // both, getter and setter
            if (getter && setter)
                member.type = "userFunction";

            // only getter
            if (getter && !setter)
            {
                member.readOnly = true;
                member.prefix = "get";
            }

            // only setter
            if (!getter && setter)
            {
                member.prefix = "set";
            }
        }

        props.push(member);
        return member;
    },

    // Add the magic "(closure)" property.
    maybeAddClosureMember: function(object, type, props, level, context, isScope)
    {
        var win = context.baseWindow || context.window;
        var wrapper = ClosureInspector.getScopeWrapper(object, win, context, isScope);
        if (!wrapper)
            return;

        var name = (isScope ? Locale.$STR("dom.scopeParentName") : Locale.$STR("dom.scopeName"));
        var title = (isScope ? undefined : Locale.$STR("dom.tip.scopeName"));
        var rep = Firebug.getRep(wrapper);
        var tag = rep.shortTag ? rep.shortTag : rep.tag;

        var member = {
            object: object,
            name: name,
            value: wrapper,
            type: type,
            rowClass: "memberRow-" + type,
            open: "",
            order: 0,
            level: level,
            indent: level*16,
            hasChildren: true,
            tag: tag,
            prefix: "",
            title: title,
            readOnly: true,
            deletable: false,
            ignoredPath: true
        };
        props.push(member);
    },

    // recursion starts with offset=0, level=0
    expandMembers: function (members, toggles, offset, level, context)
    {
        var expanded = 0;
        for (var i = offset; i < members.length; ++i)
        {
            var member = members[i];
            if (member.level < level)
                break;

            if (toggles.get(member.name))
            {
                // member.level <= level && member.name in toggles.
                member.open = "opened";

                // Don't expand if the member doesn't have children any more.
                if (!member.hasChildren)
                    continue;

                // sets newMembers.level to level+1
                var newMembers = this.getMembers(member.value, level+1, context);

                var args = [i+1, 0];
                args.push.apply(args, newMembers);
                members.splice.apply(members, args);
                if (FBTrace.DBG_DOM)
                {
                    FBTrace.sysout("expandMembers member.name "+member.name+" member "+member);
                    FBTrace.sysout("expandMembers toggles "+toggles, toggles);
                    FBTrace.sysout("expandMembers toggles.get(member.name) " +
                        toggles.get(member.name), toggles.get(member.name));
                    FBTrace.sysout("dom.expandedMembers level: "+level+" member.level " +
                        member.level, member);
                }

                var moreExpanded = newMembers.length +
                    this.expandMembers(members, toggles.get(member.name), i+1, level+1, context);
                i += moreExpanded;
                expanded += moreExpanded;
            }
        }

        return expanded;
    },

    showMembers: function(members, update, scrollTop)
    {
        // If we are still in the midst of inserting rows, cancel all pending
        // insertions here - this is a big speedup when stepping in the debugger
        if (this.timeouts)
        {
            for (var i = 0; i < this.timeouts.length; ++i)
                this.context.clearTimeout(this.timeouts[i]);
            delete this.timeouts;
        }

        if (!members.length)
            return this.showEmptyMembers();

        var panelNode = this.panelNode;
        var priorScrollTop = scrollTop == undefined ? panelNode.scrollTop : scrollTop;

        // If we are asked to "update" the current view, then build the new table
        // offscreen and swap it in when it's done
        var offscreen = update && panelNode.firstChild;
        var dest = offscreen ? this.document : panelNode;

        var table = this.tag.replace({domPanel: this, toggles: this.toggles}, dest);
        var tbody = table.lastChild;
        var rowTag = this.dirTablePlate.rowTag;

        // Insert the first slice immediately
        var setSize = members.length;
        var slice = members.splice(0, insertSliceSize);
        var result = rowTag.insertRows({members: slice}, tbody.lastChild);
        var rowCount = 1;
        var panel = this;

        Events.dispatch(this.fbListeners, "onMemberRowSliceAdded",
            [panel, result, rowCount, setSize]);

        var timeouts = [];

        var delay = 0;
        while (members.length)
        {
            with({slice: members.splice(0, insertSliceSize)})
            {
                timeouts.push(this.context.setTimeout(function addMemberRowSlice()
                {
                    result = rowTag.insertRows({members: slice}, tbody.lastChild);
                    rowCount += insertSliceSize;

                    Events.dispatch(Firebug.DOMModule.fbListeners, "onMemberRowSliceAdded",
                        [panel, result, rowCount, setSize]);

                    if ((panelNode.scrollHeight+panelNode.offsetHeight) >= priorScrollTop)
                        panelNode.scrollTop = priorScrollTop;

                }, delay));
            }

            delay += insertInterval;
        }

        if (offscreen)
        {
            timeouts.push(this.context.setTimeout(function()
            {
                if (panelNode.firstChild)
                    panelNode.replaceChild(table, panelNode.firstChild);
                else
                    panelNode.appendChild(table);

                // Scroll back to where we were before
                panelNode.scrollTop = priorScrollTop;
            }, delay));
        }
        else
        {
            timeouts.push(this.context.setTimeout(function()
            {
                panelNode.scrollTop = scrollTop == undefined ? 0 : scrollTop;
            }, delay));
        }
        this.timeouts = timeouts;
    },

    showEmptyMembers: function()
    {
        FirebugReps.Warning.tag.replace({object: "NoMembersWarning"}, this.panelNode);
    },

    findPathIndex: function(object)
    {
        var pathIndex = -1;
        for (var i = 0; i < this.objectPath.length; ++i)
        {
            if (this.getPathObject(i) == object)
                return i;
        }

        return -1;
    },

    getPathObject: function(index)
    {
        var object = this.objectPath[index];
        if (object instanceof FirebugReps.PropertyObj)
            return object.getObject();
        else
            return object;
    },

    getRowObject: function(row)
    {
        var object = getRowOwnerObject(row);
        return object ? object : this.selection;
    },

    getRealRowObject: function(row)
    {
        var object = this.getRowObject(row);
        return this.getObjectView(object);
    },

    getRowPropertyValue: function(row)
    {
        var object = this.getRealRowObject(row);
        return this.getObjectPropertyValue(object, row.domObject.name);
    },

    getObjectPropertyValue: function(object, propName)
    {
        if (!object)
            return;

        // Get the value with try-catch statement. This method is used also within
        // getContextMenuItems where the exception would break the context menu.
        // 1) The Firebug.Debugger.evaluate can throw
        // 2) object[propName] can also throws in case of e.g. non existing "abc.abc" prop name.
        try
        {
            if (object instanceof StackFrame.StackFrame)
                return Firebug.Debugger.evaluate(propName, this.context);
            else
                return object[propName];
        }
        catch (err)
        {
            if(FBTrace.DBG_DOM || FBTrace.DBG_ERRORS)
                FBTrace.sysout("dom.getObjectPropertyValue; EXCEPTION " + propName, object);
        }
    },

    getRowPathName: function(row)
    {
        var member = row.domObject, name = member.name;

        // Fake "(closure)" properties.
        if (member.ignoredPath)
            return ["", ""];

        // Closure variables.
        if (ClosureInspector.isScopeWrapper(member.object))
            return [".%", name];

        // Ordinals.
        if (name.match(/^[\d]+$/))
            return ["", "["+name+"]"];

        // Identifiers.
        if (name.match(rxIdentifier))
            return [".", name];

        // Other, weird, names.
        return ["", "[\""+name.replace(/\\/g, "\\\\").replace(/"/g,"\\\"") + "\"]"];
    },

    copyName: function(row)
    {
        var value = this.getRowPathName(row);
        value = value[1]; //don't want the separator
        System.copyToClipboard(value);
    },

    copyPath: function(row)
    {
        var path = this.getPropertyPath(row);
        System.copyToClipboard(path.join(""));
    },

    /**
     * Walk from the current row up to the most ancient parent, building an array.
     * @return array of property names and separators, eg ['foo','.','bar'].
     */
    getPropertyPath: function(row)
    {
        var path = [];
        for (var current = row; current ; current = getParentRow(current))
            path = this.getRowPathName(current).concat(path);
        path.shift(); //don't want the first separator
        return path;
    },

    copyProperty: function(row)
    {
        var value = this.getRowPropertyValue(row);
        System.copyToClipboard(value);
    },

    editProperty: function(row, editValue)
    {
        var member = row.domObject;
        if (member && member.readOnly)
            return;

        if (Css.hasClass(row, "watchNewRow"))
        {
            Firebug.Editor.startEditing(row, "");
        }
        else if (Css.hasClass(row, "watchRow"))
        {
            Firebug.Editor.startEditing(row, getRowName(row));
        }
        else
        {
            var object = this.getRowObject(row);
            this.context.thisValue = object;

            if (!editValue)
            {
                var propValue = this.getRowPropertyValue(row);

                var type = typeof propValue;
                if (type == "undefined" || type == "number" || type == "boolean")
                    editValue = "" + propValue;
                else if (type == "string")
                    editValue = "\"" + Str.escapeJS(propValue) + "\"";
                else if (propValue == null)
                    editValue = "null";
                else if (object instanceof window.Window || object instanceof StackFrame.StackFrame)
                    editValue = getRowName(row);
                else
                    editValue = "this." + getRowName(row); // XXX "this." doesn't actually work
            }

            Firebug.Editor.startEditing(row, editValue);
        }
    },

    deleteProperty: function(row)
    {
        if (Css.hasClass(row, "watchRow"))
        {
            this.deleteWatch(row);
        }
        else
        {
            var member = row.domObject;
            var object = this.getObjectView(member.object);

            if (member.deletable)
            {
                try
                {
                    delete object[member.name];
                }
                catch (exc)
                {
                    return;
                }

                this.rebuild(true);
                this.markChange();
            }
        }
    },

    setPropertyValue: function(row, value)  // value must be string
    {
        var member = row.domObject;
        var name = member.name;

        if (FBTrace.DBG_DOM)
        {
            FBTrace.sysout("setPropertyValue: " + name + " set to " +
                (typeof value === "string" ? "\"" + value + "\"" : "non-string!?!?"), row);
        }

        if (name == "this")
            return;

        var object = this.getRealRowObject(row);
        if (object && !(object instanceof StackFrame.StackFrame))
        {
            Firebug.CommandLine.evaluate(value, this.context, object, this.context.getGlobalScope(),
                function success(result, context)
                {
                    if (FBTrace.DBG_DOM)
                    {
                        FBTrace.sysout("setPropertyValue evaluate success object[" + name + "]" +
                            " set to type " + typeof result, result);
                    }
                    object[name] = result;
                },
                function failed(exc, context)
                {
                    try
                    {
                        if (FBTrace.DBG_DOM)
                        {
                            FBTrace.sysout("setPropertyValue evaluate FAILED", exc);
                        }

                        // If the value doesn't parse, then just store it as a string.
                        // Some users will not realize they're supposed to enter a JavaScript
                        // expression and just type literal text
                        object[name] = value;
                    }
                    catch (exc) {}
                }
            );
        }
        else if (this.context.stopped)
        {
            try
            {
                Firebug.CommandLine.evaluate(name + "=" + value, this.context);
            }
            catch (exc)
            {
                try
                {
                    // See catch block above...
                    object[name] = value;
                }
                catch (exc)
                {
                    return;
                }
            }

            // Clear cached scope chain (it'll be regenerated the next time the getScopes
            // is executed). This forces the watch window to update in case a closer scope
            // variables have been changed during a debugging session.
            if (object instanceof StackFrame.StackFrame)
                object.clearScopes();
        }

        this.rebuild(true);
        this.markChange();
    },

    breakOnProperty: function(row)
    {
        var member = row.domObject;
        if (!member)
            return;

        // Bail out if this property is not breakable.
        if (!member.breakable)
            return;

        var name = member.name;
        if (name == "this")
            return;

        var object = this.getRowObject(row);
        object = this.getObjectView(object);
        if (!object)
            return;

        // Create new or remove an existing breakpoint.
        var breakpoints = this.context.dom.breakpoints;
        var bp = breakpoints.findBreakpoint(object, name);
        if (bp)
        {
            row.removeAttribute("breakpoint");
            breakpoints.removeBreakpoint(object, name);
        }
        else
        {
            breakpoints.addBreakpoint(object, name, this, row);
            row.setAttribute("breakpoint", "true");
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    initialize: function()
    {
        this.objectPath = [];
        this.propertyPath = [];
        this.viewPath = [];
        this.pathIndex = -1;
        this.toggles = new ToggleBranch.ToggleBranch();

        Firebug.Panel.initialize.apply(this, arguments);
    },

    initializeNode: function(node)
    {
        Firebug.Panel.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        Firebug.Panel.destroyNode.apply(this, arguments);
    },

    destroy: function(state)
    {
        var view = this.viewPath[this.pathIndex];
        if (view && this.panelNode.scrollTop)
            view.scrollTop = this.panelNode.scrollTop;

        if (this.pathIndex > -1)
            state.pathIndex = this.pathIndex;
        if (this.viewPath)
            state.viewPath = this.viewPath;
        if (this.propertyPath)
            state.propertyPath = this.propertyPath;

        if (this.propertyPath.length > 0 && !this.propertyPath[1])
            state.firstSelection = Persist.persistObject(this.getPathObject(1), this.context);

        if (FBTrace.DBG_DOM)
            FBTrace.sysout("dom.destroy; state:", state);

        Firebug.Panel.destroy.apply(this, arguments);
    },

    show: function(state)
    {
        this.showToolbarButtons("fbStatusButtons", true);

        if (!this.selection)
        {
            if (!state)
            {
                this.select(null);
                return;
            }
            if (state.pathIndex > -1)
                this.pathIndex = state.pathIndex;
            if (state.viewPath)
                this.viewPath = state.viewPath;
            if (state.propertyPath)
                this.propertyPath = state.propertyPath;

            var defaultObject = this.getDefaultSelection();
            var selectObject = defaultObject;

            if (state.firstSelection)
            {
                var restored = state.firstSelection(this.context);
                if (restored)
                {
                    selectObject = restored;
                    this.objectPath = [defaultObject, restored];
                }
                else
                    this.objectPath = [defaultObject];
            }
            else
            {
                this.objectPath = [defaultObject];
            }

            if (this.propertyPath.length > 1)
            {
                selectObject = this.resetPaths(selectObject);
            }
            else
            {
                // Sync with objectPath always containing a default object.
                this.propertyPath.push(null);
            }

            var selection = state.pathIndex < this.objectPath.length
                ? this.getPathObject(state.pathIndex)
                : this.getPathObject(this.objectPath.length-1);

            if (FBTrace.DBG_DOM)
                FBTrace.sysout("dom.show; selection:", selection);

            this.select(selection);
        }
    },

    resetPaths: function(selectObject)
    {
        for (var i = 1; i < this.propertyPath.length; ++i)
        {
            var name = this.propertyPath[i];
            if (!name)
                continue;

            var object = selectObject;
            try
            {
                selectObject = object[name];
            }
            catch (exc)
            {
                selectObject = null;
            }

            if (selectObject)
            {
                this.objectPath.push(new FirebugReps.PropertyObj(object, name));
            }
            else
            {
                // If we can't access a property, just stop
                this.viewPath.splice(i);
                this.propertyPath.splice(i);
                this.objectPath.splice(i);
                selectObject = this.getPathObject(this.objectPath.length-1);
                break;
            }
        }
    },

    hide: function()
    {
        var view = this.viewPath[this.pathIndex];
        if (view && this.panelNode.scrollTop)
            view.scrollTop = this.panelNode.scrollTop;
    },

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? Locale.$STR("dom.disableBreakOnPropertyChange") :
            Locale.$STR("dom.label.breakOnPropertyChange"));
    },

    supportsObject: function(object, type)
    {
        if (object == null)
            return 1000;

        if (typeof object == "undefined")
            return 1000;
        else if (object instanceof SourceLink.SourceLink)
            return 0;
        else
            return 1; // just agree to support everything but not aggressively.
    },

    refresh: function()
    {
        this.rebuild(true);
    },

    updateSelection: function(object)
    {
        if (FBTrace.DBG_DOM)
            FBTrace.sysout("dom.updateSelection", object);

        var previousIndex = this.pathIndex;
        var previousView = previousIndex == -1 ? null : this.viewPath[previousIndex];

        var newPath = this.pathToAppend;
        delete this.pathToAppend;

        var pathIndex = this.findPathIndex(object);
        if (newPath || pathIndex == -1)
        {
            this.toggles = new ToggleBranch.ToggleBranch();

            if (newPath)
            {
                // Remove everything after the point where we are inserting, so we
                // essentially replace it with the new path
                if (previousView)
                {
                    if (this.panelNode.scrollTop)
                        previousView.scrollTop = this.panelNode.scrollTop;

                    this.objectPath.splice(previousIndex+1);
                    this.propertyPath.splice(previousIndex+1);
                    this.viewPath.splice(previousIndex+1);
                }

                var value = this.getPathObject(previousIndex);
                if (!value)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("dom.updateSelection no pathObject for " + previousIndex);
                    return;
                }

                // XXX This is wrong with closures, but I haven't noticed anything
                // break and I don't know how to fix, so let's just leave it...
                for (var i = 0; i < newPath.length; ++i)
                {
                    var name = newPath[i];
                    var object = value;
                    try
                    {
                        value = value[name];
                    }
                    catch(exc)
                    {
                        if (FBTrace.DBG_ERRORS)
                        {
                            FBTrace.sysout("dom.updateSelection FAILS at path_i=" + i +
                                " for name:" + name);
                        }
                        return;
                    }

                    ++this.pathIndex;
                    this.objectPath.push(new FirebugReps.PropertyObj(object, name));
                    this.propertyPath.push(name);
                    this.viewPath.push({toggles: this.toggles, scrollTop: 0});
                }
            }
            else
            {
                this.toggles = new ToggleBranch.ToggleBranch();

                var win = this.getDefaultSelection();
                if (object == win)
                {
                    this.pathIndex = 0;
                    this.objectPath = [win];
                    this.propertyPath = [null];
                    this.viewPath = [{toggles: this.toggles, scrollTop: 0}];
                }
                else
                {
                    this.pathIndex = 1;
                    this.objectPath = [win, object];
                    this.propertyPath = [null, null];
                    this.viewPath = [
                        {toggles: new ToggleBranch.ToggleBranch(), scrollTop: 0},
                        {toggles: this.toggles, scrollTop: 0}
                    ];
                }
            }

            this.panelNode.scrollTop = 0;
            this.rebuild(false);
        }
        else
        {
            this.pathIndex = pathIndex;

            var view = this.viewPath[pathIndex];
            this.toggles = view ? view.toggles : new ToggleBranch.ToggleBranch();

            // Persist the current scroll location
            if (previousView && this.panelNode.scrollTop)
                previousView.scrollTop = this.panelNode.scrollTop;

            this.rebuild(false, view ? view.scrollTop : 0);
        }
    },

    getObjectPath: function(object)
    {
        return this.objectPath;
    },

    getDefaultSelection: function()
    {
        return this.getObjectView(this.context.getGlobalScope());
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    updateOption: function(name, value)
    {
        var options = new Set();
        options.add("showUserProps");
        options.add("showUserFuncs");
        options.add("showDOMProps");
        options.add("showDOMFuncs");
        options.add("showDOMConstants");
        options.add("showInlineEventHandlers");
        options.add("showClosures");
        options.add("showOwnProperties");
        options.add("showEnumerableProperties");

        if (options.has(name))
            this.rebuild(true);
    },

    getOptionsMenuItems: function()
    {
        return [
            Menu.optionMenu("ShowUserProps", "showUserProps",
                "dom.option.tip.Show_User_Props"),
            Menu.optionMenu("ShowUserFuncs", "showUserFuncs",
                "dom.option.tip.Show_User_Funcs"),
            Menu.optionMenu("ShowDOMProps", "showDOMProps",
                "dom.option.tip.Show_DOM_Props"),
            Menu.optionMenu("ShowDOMFuncs", "showDOMFuncs",
                "dom.option.tip.Show_DOM_Funcs"),
            Menu.optionMenu("ShowDOMConstants", "showDOMConstants",
                "dom.option.tip.Show_DOM_Constants"),
            Menu.optionMenu("ShowInlineEventHandlers", "showInlineEventHandlers",
                "ShowInlineEventHandlersTooltip"),
            Menu.optionMenu("ShowClosures", "showClosures",
                "dom.option.tip.Show_Closures"),
            "-",
            Menu.optionMenu("ShowOwnProperties", "showOwnProperties",
                "ShowOwnPropertiesTooltip"),
            Menu.optionMenu("ShowEnumerableProperties",
                "showEnumerableProperties", "ShowEnumerablePropertiesTooltip"),
            "-",
            {label: "Refresh", command: Obj.bindFixed(this.rebuild, this, true),
                tooltiptext: "panel.tip.Refresh"}
        ];
    },

    getContextMenuItems: function(object, target)
    {
        if (FBTrace.DBG_DOM)
            FBTrace.sysout("dom.getContextMenuItems;", object);

        var row = Dom.getAncestorByClass(target, "memberRow");

        var items = [];

        if (row && row.domObject && !row.domObject.ignoredPath)
        {
            var member = row.domObject;
            var rowName = member.name;
            var rowObject = member.object;
            var rowValue = member.value;

            var isWatch = Css.hasClass(row, "watchRow");
            var isStackFrame = rowObject instanceof StackFrame.StackFrame;
            var label, tooltiptext;

            items.push(
                "-",
                {
                    label: "Copy_Name",
                    tooltiptext: "dom.tip.Copy_Name",
                    command: Obj.bindFixed(this.copyName, this, row)
                },
                {
                    label: "Copy_Path",
                    tooltiptext: "dom.tip.Copy_Path",
                    command: Obj.bindFixed(this.copyPath, this, row)
                }
            );

            if (typeof rowValue == "string" || typeof rowValue == "number")
            {
                // Functions already have a copy item in their context menu
                items.push(
                    {
                        label: "CopyValue",
                        tooltiptext: "dom.tip.Copy_Value",
                        command: Obj.bindFixed(this.copyProperty, this, row)
                    }
                );
            }

            if (isWatch)
            {
                label = "EditWatch";
                tooltiptext = "watch.tip.Edit_Watch";
            }
            else if (isStackFrame)
            {
                label = "EditVariable";
                tooltiptext = "stack.tip.Edit_Variable";
            }
            else
            {
                label = "EditProperty";
                tooltiptext = "dom.tip.Edit_Property";
            }

            var readOnly = (!isWatch && !isStackFrame && member.readOnly);
            if (!readOnly)
            {
                items.push(
                    "-",
                    {
                        label: label,
                        tooltiptext: tooltiptext,
                        command: Obj.bindFixed(this.editProperty, this, row)
                    }
                );
            }

            if (isWatch ||
                (member.deletable && !isStackFrame && !Dom.isDOMMember(rowObject, rowName)))
            {
                items.push(
                    {
                        label: isWatch ? "DeleteWatch" : "DeleteProperty",
                        id: "DeleteProperty",
                        tooltiptext: isWatch ? "watch.tip.Delete_Watch" :
                            "dom.tip.Delete_Property",
                        command: Obj.bindFixed(this.deleteProperty, this, row)
                    }
                );
            }

            if (!Dom.isDOMMember(rowObject, rowName) && member && member.breakable)
            {
                items.push(
                    "-",
                    {
                        label: "dom.label.breakOnPropertyChange",
                        tooltiptext: "dom.tip.Break_On_Property_Change",
                        type: "checkbox",
                        checked: this.context.dom.breakpoints.findBreakpoint(rowObject, rowName),
                        command: Obj.bindFixed(this.breakOnProperty, this, row)
                    }
                );
            }
        }

        items.push(
            "-",
            {
                label: "Refresh",
                tooltiptext: "panel.tip.Refresh",
                command: Obj.bindFixed(this.rebuild, this, true)
            }
        );

        return items;
    },

    getEditor: function(target, value)
    {
        if (!this.editor)
            this.editor = new DOMEditor(this.document);

        return this.editor;
    }
});

// ********************************************************************************************* //

var DOMMainPanel = Firebug.DOMPanel = function () {};

Firebug.DOMPanel.DirTable = DirTablePlate;

DOMMainPanel.prototype = Obj.extend(Firebug.DOMBasePanel.prototype,
{
    selectRow: function(row, target)
    {
        if (!target)
            target = row.lastChild.firstChild;

        if (!target || !target.repObject)
            return;

        this.pathToAppend = getPath(row);

        // If the object is inside an array, look up its index
        var valueBox = row.lastChild.firstChild;
        if (Css.hasClass(valueBox, "objectBox-array"))
        {
            var arrayIndex = FirebugReps.Arr.getItemIndex(target);
            this.pathToAppend.push(arrayIndex);
        }

        // Make sure we get a fresh status path for the object, since otherwise
        // it might find the object in the existing path and not refresh it
        Firebug.chrome.clearStatusPath();

        this.select(target.repObject, true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onClick: function(event)
    {
        var repNode = Firebug.getRepNode(event.target);
        if (repNode)
        {
            var row = Dom.getAncestorByClass(event.target, "memberRow");
            if (row)
            {
                this.selectRow(row, repNode);
                Events.cancelEvent(event);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "dom",
    searchable: true,
    statusSeparator: ">",
    enableA11y: true,
    deriveA11yFrom: "console",
    searchType : "dom",
    order: 50,
    inspectable: true,

    initialize: function()
    {
        this.onClick = Obj.bind(this.onClick, this);

        Firebug.DOMBasePanel.prototype.initialize.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        Events.addEventListener(this.panelNode, "click", this.onClick, false);

        Firebug.DOMBasePanel.prototype.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        Events.removeEventListener(this.panelNode, "click", this.onClick, false);

        Firebug.DOMBasePanel.prototype.destroyNode.apply(this, arguments);
    },

    search: function(text, reverse)
    {
        if (!text)
        {
            delete this.currentSearch;
            this.highlightNode(null);
            this.document.defaultView.getSelection().removeAllRanges();
            return false;
        }

        var row;
        if (this.currentSearch && text == this.currentSearch.text)
        {
            row = this.currentSearch.findNext(true, undefined, reverse,
                Firebug.Search.isCaseSensitive(text));
        }
        else
        {
            function findRow(node) { return Dom.getAncestorByClass(node, "memberRow"); }
            this.currentSearch = new Search.TextSearch(this.panelNode, findRow);
            row = this.currentSearch.find(text, reverse, Firebug.Search.isCaseSensitive(text));
        }

        if (row)
        {
            var sel = this.document.defaultView.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.currentSearch.range);

            Dom.scrollIntoCenterView(row, this.panelNode);

            this.highlightNode(row);
            Events.dispatch(this.fbListeners, 'onDomSearchMatchFound', [this, text, row]);
            return true;
        }
        else
        {
            this.document.defaultView.getSelection().removeAllRanges();
            Events.dispatch(this.fbListeners, 'onDomSearchMatchFound', [this, text, null]);
            return false;
        }
    }
});

// ********************************************************************************************* //

function DOMSidePanel() {}

DOMSidePanel.prototype = Obj.extend(Firebug.DOMBasePanel.prototype,
{
    name: "domSide",
    parentPanel: "html",
    order: 3,
    enableA11y: true,
    deriveA11yFrom: "console",
});

// ********************************************************************************************* //
// Local Helpers

function DOMEditor(doc)
{
    this.box = this.tag.replace({}, doc, this);
    this.input = this.box.childNodes[1];

    var completionBox = this.box.childNodes[0];
    var options = {
        includeCurrentScope: true
    };
    this.setupCompleter(completionBox, options);
}

DOMEditor.prototype = domplate(Firebug.JSEditor.prototype,
{
    tag:
        DIV({style: "position: absolute;"},
            INPUT({"class": "fixedWidthEditor completionBox", type: "text",
                tabindex: "-1"}),
            INPUT({"class": "fixedWidthEditor completionInput", type: "text",
                oninput: "$onInput", onkeypress: "$onKeyPress"})),

    endEditing: function(target, value, cancel)
    {
        // XXXjoe Kind of hackish - fix me
        delete this.panel.context.thisValue;

        if (cancel || value == "")
            return;

        var row = Dom.getAncestorByClass(target, "memberRow");

        Events.dispatch(this.panel.fbListeners, "onWatchEndEditing", [this.panel]);

        if (!row)
            this.panel.addWatch(value);
        else if (Css.hasClass(row, "watchRow"))
            this.panel.setWatchValue(row, value);
        else
            this.panel.setPropertyValue(row, value);
    }
});

// ********************************************************************************************* //
// Local Helpers

function isClassFunction(fn)
{
    try
    {
        for (var name in fn.prototype)
            return true;
    } catch (exc) {}
    return false;
}

function isArguments(obj)
{
    try
    {
        return isFinite(obj.length) && obj.length > 0 && typeof obj.callee === "function";
    } catch (exc) {}
    return false;
}

function isPrototype(name)
{
    return (name == "prototype" || name == "__proto__");
}

function getPropertyDescriptor(object, propName)
{
    try
    {
        var desc;
        while (object)
        {
            desc = Object.getOwnPropertyDescriptor(object, propName);
            if (desc)
                return desc;
            object = Object.getPrototypeOf(object);
        }
    }
    catch (e)
    {
    }
    return undefined;
}

function getRowName(row)
{
    // XXX This can return not only property names but also just descriptive ones,
    // like "(closure)", and indeed the collapse remembering logic relies on that.
    var labelNode = row.getElementsByClassName("memberLabelCell").item(0);
    return labelNode.textContent;
}

function getRowValue(row)
{
    var valueNode = row.getElementsByClassName("memberValueCell").item(0);
    return valueNode.firstChild.repObject;
}

function getRowOwnerObject(row)
{
    var parentRow = getParentRow(row);
    if (parentRow)
        return getRowValue(parentRow);
}

function getParentRow(row)
{
    var level = "" + (parseInt(row.getAttribute("level"), 10) - 1);
    if (level == "-1")
        return;
    for (row = row.previousSibling; row; row = row.previousSibling)
    {
        if (row.getAttribute("level") === level)
            return row;
    }
}

// Return an array of parts that uniquely identifies a row (not always all JavaScript)
function getPath(row)
{
    var name = getRowName(row);
    var path = [name];

    var level = parseInt(row.getAttribute("level"), 10) - 1;
    for (row = row.previousSibling; row && level >= 0; row = row.previousSibling)
    {
        if (parseInt(row.getAttribute("level"), 10) === level)
        {
            var name = getRowName(row);
            path.splice(0, 0, name);

            --level;
        }
    }

    return path;
}

// ********************************************************************************************* //
// Registration

// xxxHonza: Every panel should have its own module.
Firebug.registerPanel(DOMMainPanel);
Firebug.registerPanel(DOMSidePanel);

return Firebug.DOMModule;

// ********************************************************************************************* //
}});

