/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const jsdIStackFrame = Ci.jsdIStackFrame;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const insertSliceSize = 18;
const insertInterval = 40;

const rxIdentifier = /^[$_A-Za-z][$_A-Za-z0-9]*$/

const ignoreVars =
{
    "__firebug__": 1,
    "eval": 1,

    // We are forced to ignore Java-related variables, because
    // trying to access them causes browser freeze
    "java": 1,
    "sun": 1,
    "Packages": 1,
    "JavaArray": 1,
    "JavaMember": 1,
    "JavaObject": 1,
    "JavaClass": 1,
    "JavaPackage": 1,
    "_firebug": 1,
    "_FirebugConsole": 1,
    "_FirebugCommandLine": 1,
};

// ************************************************************************************************

Firebug.DOMModule = extend(Firebug.Module,
{
    initialize: function(prefDomain, prefNames)
    {
        Firebug.Module.initialize.apply(this, arguments);
        Firebug.Debugger.addListener(this.DebuggerListener);
    },

    initContext: function(context, persistedState)
    {
        Firebug.Module.initContext.apply(this, arguments);
        context.dom = {breakpoints: new DOMBreakpointGroup()};
    },

    loadedContext: function(context, persistedState)
    {
        context.dom.breakpoints.load(context);
    },

    destroyContext: function(context, persistedState)
    {
        Firebug.Module.destroyContext.apply(this, arguments);

        context.dom.breakpoints.store(context);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);
        Firebug.Debugger.removeListener(this.DebuggerListener);
    },
});

// ************************************************************************************************

const WatchRowTag =
    TR({"class": "watchNewRow", level: 0},
        TD({"class": "watchEditCell", colspan: 3},
            DIV({"class": "watchEditBox a11yFocusNoTab", role: "button", 'tabindex' : '0',
                'aria-label' : $STR('a11y.labels.press enter to add new watch expression')},
                    $STR("NewWatch")
            )
        )
    );

const SizerRow =
    TR({role : 'presentation'},
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
                role: 'presentation'},
                DIV({"class": "memberLabel $member.type\\Label"},
                    SPAN({"class": "memberLabelPrefix"}, "$member.prefix"),
                    SPAN("$member.name")
                )
            ),
            TD({"class": "memberValueCell", role : 'presentation'},
                TAG("$member.tag", {object: "$member.value"})
            )
        ),

    tag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick",
            role: "tree", 'aria-label': $STR('aria.labels.dom properties')},
            TBODY({role: 'presentation'},
                SizerRow,
                FOR("member", "$object|memberIterator",
                    TAG("$memberRowTag", {member: "$member"})
                )
            )
        ),

    watchTag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0,
               _toggles: "$toggles", _domPanel: "$domPanel", onclick: "$onClick", role : 'tree'},
            TBODY({role : 'presentation'},
                SizerRow,
                WatchRowTag
            )
        ),

    tableTag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0,
            _toggles: "$toggles", _domPanel: "$domPanel", onclick: "$onClick",
            role: 'tree', 'aria-label': 'DOM properties'},
            TBODY({role : 'presentation'},
                SizerRow
            )
        ),

    rowTag:
        FOR("member", "$members",
            TAG("$memberRowTag", {member: "$member"})
        ),

    memberIterator: function(object, level)
    {
        return this.getMembers(object, level, this.context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onClick: function(event)
    {
        if (!isLeftClick(event))
            return;

        var row = getAncestorByClass(event.target, "memberRow");
        var label = getElementByClass(row, "memberLabel");
        var valueCell = getElementByClass(row, "memberValueCell");
        var object = Firebug.getRepObject(event.target);
        var target = row.lastChild.firstChild;
        var isString = hasClass(target,"objectBox-string");
        var inValueCell = event.target == valueCell || event.target == target;

        if (label && hasClass(row, "hasChildren") && !(isString && inValueCell))
        {
            var row = label.parentNode.parentNode;
            this.toggleRow(row);
        }
        else
        {
            if (typeof(object) == "function")
            {
                Firebug.chrome.select(object, "script");
                cancelEvent(event);
            }
            else if (event.detail == 2 && !object)
            {
                var panel = row.parentNode.parentNode.domPanel;
                if (panel)
                {
                    var rowValue = panel.getRowPropertyValue(row);
                    if (typeof(rowValue) == "boolean")
                        panel.setPropertyValue(row, !rowValue);
                    else
                        panel.editProperty(row);

                    cancelEvent(event);
                }
            }
        }
    },

    toggleRow: function(row)
    {
        var level = parseInt(row.getAttribute("level"));
        var toggles = row.parentNode.parentNode.toggles;

        var panel = row.parentNode.parentNode.domPanel;
        var target = row.lastChild.firstChild;
        var isString = hasClass(target,"objectBox-string");

        if (hasClass(row, "opened"))
        {
            removeClass(row, "opened");

            if (isString)
            {
                var rowValue = panel.getRowPropertyValue(row);
                row.lastChild.firstChild.textContent = '"' + cropMultipleLines(rowValue) + '"';
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
                            delete toggles[path[i]];
                        else
                            toggles = toggles[path[i]];
                    }
                }

                var rowTag = this.rowTag;
                var tbody = row.parentNode;

                setTimeout(function()
                {
                    for (var firstRow = row.nextSibling; firstRow; firstRow = row.nextSibling)
                    {
                        if (parseInt(firstRow.getAttribute("level")) <= level)
                            break;

                        tbody.removeChild(firstRow);
                    }
                }, row.insertTimeout ? row.insertTimeout : 0);
            }
        }
        else
        {
            setClass(row, "opened");
            if (isString)
            {
                var rowValue = panel.getRowPropertyValue(row);
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
                        if (toggles.hasOwnProperty(name))
                            toggles = toggles[name];
                        else
                            toggles = toggles[name] = {};
                    }
                }

                var context = panel ? panel.context : null;
                var members = Firebug.DOMBasePanel.prototype.getMembers(target.repObject, level+1, context);

                var rowTag = this.rowTag;
                var lastRow = row;

                var delay = 0;
                var setSize = members.length;
                var rowCount = 1;
                while (members.length)
                {
                    setTimeout(function(slice, isLast)
                    {
                        if (lastRow.parentNode)
                        {
                            var result = rowTag.insertRows({members: slice}, lastRow);
                            lastRow = result[1];
                            dispatch([Firebug.A11yModel], 'onMemberRowSliceAdded', [null, result, rowCount, setSize]);
                            rowCount += insertSliceSize;
                        }
                        if (isLast)
                            delete row.insertTimeout;
                    }, delay, members.splice(0, insertSliceSize), !members.length);

                    delay += insertInterval;
                }

                row.insertTimeout = delay;
            }
        }
    },

    onClickRowHeader: function(event)
    {
        cancelEvent(event);

        var rowHeader = event.target;
        if (!hasClass(rowHeader, "memberRowHeader"))
            return;

        var row = getAncestorByClass(event.target, "memberRow");
        if (!row)
            return;

        var panel = row.parentNode.parentNode.domPanel;
        if (panel)
            panel.breakOnProperty(row);
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

// ************************************************************************************************

Firebug.DOMBasePanel = function() {}

Firebug.DOMBasePanel.prototype = extend(Firebug.ActivablePanel,
{
    tag: DirTablePlate.tableTag,

    getRealObject: function(object)
    {
        return unwrapObject(object);
    },

    rebuild: function(update, scrollTop)
    {
        dispatch([Firebug.A11yModel], 'onBeforeDomUpdateSelection', [this]);
        var members = this.getMembers(this.selection, 0, this.context);
        this.expandMembers(members, this.toggles, 0, 0, this.context);

        this.showMembers(members, update, scrollTop);
    },
    /*
     *  @param object a user-level object wrapped in security blanket
     *  @param level for a.b.c, level is 2
     *  @param context
     */
    getMembers: function(object, level, context)
    {
        if (!level)
            level = 0;

        var ordinals = [], userProps = [], userClasses = [], userFuncs = [],
            domProps = [], domFuncs = [], domConstants = [];

        try
        {
            var domMembers = getDOMMembers(object);
            var insecureObject = unwrapObject(object);

            for (var name in insecureObject)  // enumeration is safe
            {
                // Ignore only global variables (properties of the |window| object).
                // javascript.options.strict says ignoreVars is undefined.
                if (ignoreVars[name] == 1 && (object instanceof Window))
                {
                    if (FBTrace.DBG_DOM)
                        FBTrace.sysout("dom.getMembers: ignoreVars: " + name + ", " + level, object);
                    continue;
                }

                var val;
                try
                {
                    val = insecureObject[name];  // getter is safe
                }
                catch (exc)
                {
                    // Sometimes we get exceptions trying to access certain members
                    if (FBTrace.DBG_ERRORS && FBTrace.DBG_DOM)
                        FBTrace.sysout("dom.getMembers cannot access "+name, exc);
                }

                var ordinal = parseInt(name);
                if (ordinal || ordinal == 0)
                {
                    addMember(object, "ordinal", ordinals, name, val, level, 0, context);
                }
                else if (typeof(val) == "function")
                {
                    if (isClassFunction(val))
                        addMember(object, "userClass", userClasses, name, val, level, 0, context);
                    else if (name in domMembers)
                        addMember(object, "domFunction", domFuncs, name, val, level, domMembers[name], context);
                    else
                        addMember(object, "userFunction", userFuncs, name, val, level, 0, context);
                }
                else
                {
                    if (name in domMembers)
                        addMember(object, "dom", domProps, name, val, level, domMembers[name], context);
                    else if (name in domConstantMap)
                        addMember(object, "dom", domConstants, name, val, level, 0, context);
                    else
                        addMember(object, "user", userProps, name, val, level, 0, context);
                }
            }
        }
        catch (exc)
        {
            // Sometimes we get exceptions just from trying to iterate the members
            // of certain objects, like StorageList, but don't let that gum up the works
            //throw exc;
            if (FBTrace.DBG_ERRORS && FBTrace.DBG_DOM)
                FBTrace.sysout("dom.getMembers FAILS: ", exc);
        }

        function sortName(a, b) { return a.name > b.name ? 1 : -1; }
        function sortOrder(a, b) { return a.order > b.order ? 1 : -1; }

        var members = [];

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
            domFuncs.sort(sortName);
            members.push.apply(members, domFuncs);
        }

        if (Firebug.showDOMConstants)
            members.push.apply(members, domConstants);

        return members;
    },

    expandMembers: function (members, toggles, offset, level, context)  // recursion starts with offset=0, level=0
    {
        var expanded = 0;
        for (var i = offset; i < members.length; ++i)
        {
            var member = members[i];
            if (member.level > level)
                break;

            if ( toggles.hasOwnProperty(member.name) )
            {
                member.open = "opened";  // member.level <= level && member.name in toggles.
                if (member.type == 'string')
                    continue;
                var newMembers = this.getMembers(member.value, level+1, context);  // sets newMembers.level to level+1

                var args = [i+1, 0];
                args.push.apply(args, newMembers);
                members.splice.apply(members, args);
                if (FBTrace.DBG_DOM)
                {
                    FBTrace.sysout("expandMembers member.name", member.name);
                    FBTrace.sysout("expandMembers toggles", toggles);
                    FBTrace.sysout("expandMembers toggles[member.name]", toggles[member.name]);
                    FBTrace.sysout("dom.expandedMembers level: "+level+" member", member);
                }

                expanded += newMembers.length;
                i += newMembers.length + this.expandMembers(members, toggles[member.name], i+1, level+1, context);
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
        var rowTag = DirTablePlate.rowTag;

        // Insert the first slice immediately
        var setSize = members.length;
        var slice = members.splice(0, insertSliceSize);
        var result = rowTag.insertRows({members: slice}, tbody.lastChild);
        var rowCount = 1;
        var panel = this;
        dispatch([Firebug.A11yModel], 'onMemberRowSliceAdded', [panel, result, rowCount, setSize]);
        var timeouts = [];

        var delay = 0;
        while (members.length)
        {
            timeouts.push(this.context.setTimeout(function(slice)
            {
                result = rowTag.insertRows({members: slice}, tbody.lastChild);
                rowCount += insertSliceSize;
                dispatch([Firebug.A11yModel], 'onMemberRowSliceAdded', [panel, result, rowCount, setSize]);

                if ((panelNode.scrollHeight+panelNode.offsetHeight) >= priorScrollTop)
                    panelNode.scrollTop = priorScrollTop;
            }, delay, members.splice(0, insertSliceSize)));

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

    findPathObject: function(object)
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
        if (object instanceof Property)
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
        return this.getRealObject(object);
    },

    getRowPropertyValue: function(row)
    {
        var object = this.getRealRowObject(row);
        return this.getObjectPropertyValue(object, row.domObject.name);
    },

    getObjectPropertyValue: function(object, propName)
    {
        if (object)
        {
            if (object instanceof jsdIStackFrame)
                return Firebug.Debugger.evaluate(propName, this.context);
            else
                return object[propName];
        }
    },

    getRowPathName: function(row)
    {
        var name = row.domObject.name;
        var seperator = "";

        if(name.match(/^[\d]+$/))//ordinal
            return ["", "["+name+"]"];
        else if(name.match(rxIdentifier))//identifier
            return [".", name];
        else//map keys
            return ["", "[\""+name.replace(/\\/g, "\\\\").replace(/"/g,"\\\"") + "\"]"];
    },

    copyName: function(row)
    {
        var value = this.getRowPathName(row);
        value = value[1];//don't want the seperator
        copyToClipboard(value);
    },

    copyPath: function(row)
    {
        var path = this.getPropertyPath(row);
        copyToClipboard(path.join(""));
    },

    /*
     * Walk from the current row up to the most ancient parent, building an array.
     * @return array of property names and separators, eg ['foo','.','bar'].
     */
    getPropertyPath: function(row)
    {
        var path = [];
        for(var current = row; current ; current = getParentRow(current))
            path = this.getRowPathName(current).concat(path);
        path.splice(0,1); //don't want the first seperator
        return path;
    },

    copyProperty: function(row)
    {
        var value = this.getRowPropertyValue(row);
        copyToClipboard(value);
    },

    editProperty: function(row, editValue)
    {
        if (hasClass(row, "watchNewRow"))
        {
            if (this.context.stopped)
                Firebug.Editor.startEditing(row, "");
            else if (Firebug.Console.isAlwaysEnabled())  // not stopped in debugger, need command line
            {
                if (Firebug.CommandLine.onCommandLineFocus())
                    Firebug.Editor.startEditing(row, "");
                else
                    row.innerHTML = $STR("warning.Command line blocked?");
            }
            else
                row.innerHTML = $STR("warning.Console must be enabled");
        }
        else if (hasClass(row, "watchRow"))
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

                var type = typeof(propValue);
                if (type == "undefined" || type == "number" || type == "boolean")
                    editValue = propValue;
                else if (type == "string")
                    editValue = "\"" + escapeJS(propValue) + "\"";
                else if (propValue == null)
                    editValue = "null";
                else if (object instanceof Window || object instanceof jsdIStackFrame)
                    editValue = getRowName(row);
                else
                    editValue = "this." + getRowName(row);
            }

            Firebug.Editor.startEditing(row, editValue);
        }
    },

    deleteProperty: function(row)
    {
        if (hasClass(row, "watchRow"))
            this.deleteWatch(row);
        else
        {
            var object = getRowOwnerObject(row);
            if (!object)
                object = this.selection;
            object = this.getRealObject(object);

            if (object)
            {
                var name = getRowName(row);
                try
                {
                    delete object[name];
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
        if(FBTrace.DBG_DOM)
        {
            FBTrace.sysout("row: "+row);
            FBTrace.sysout("value: "+value+" type "+typeof(value), value);
        }

        var name = getRowName(row);
        if (name == "this")
            return;

        var object = this.getRealRowObject(row);
        if (object && !(object instanceof jsdIStackFrame))
        {
             // unwrappedJSObject.property = unwrappedJSObject
             Firebug.CommandLine.evaluate(value, this.context, object, this.context.getGlobalScope(),
                 function success(result, context)
                 {
                     if (FBTrace.DBG_DOM)
                         FBTrace.sysout("setPropertyValue evaluate success object["+name+"]="+result+" type "+typeof(result), result);
                     object[name] = result;
                 },
                 function failed(exc, context)
                 {
                     try
                     {
                         if (FBTrace.DBG_DOM)
                              FBTrace.sysout("setPropertyValue evaluate failed with exc:"+exc+" object["+name+"]="+value+" type "+typeof(value), exc);
                         // If the value doesn't parse, then just store it as a string.  Some users will
                         // not realize they're supposed to enter a JavaScript expression and just type
                         // literal text
                         object[name] = String(value);  // unwrappedJSobject.property = string
                     }
                     catch (exc)
                     {
                         return;
                     }
                  }
             );
        }
        else if (this.context.stopped)
        {
            try
            {
                Firebug.CommandLine.evaluate(name+"="+value, this.context);
            }
            catch (exc)
            {
                try
                {
                    // See catch block above...
                    object[name] = String(value); // unwrappedJSobject.property = string
                }
                catch (exc)
                {
                    return;
                }
            }
        }

        this.rebuild(true);
        this.markChange();
    },

    highlightRow: function(row)
    {
        if (this.highlightedRow)
            cancelClassTimed(this.highlightedRow, "jumpHighlight", this.context);

        this.highlightedRow = row;

        if (row)
            setClassTimed(row, "jumpHighlight", this.context);
    },

    breakOnProperty: function(row)
    {
        var member = row.domObject;
        if (!member)
            return;

        // Bail out if this property is not breakable.
        if (!member.breakable)
            return;

        //xxxHonza: don't use getRowName to get the prop name. From some reason
        // unwatch doesn't work if row.firstChild.textContent is used.
        // It works only from within the watch handler method if the passed param
        // name is used.
        var name = member.name;
        if (name == "this")
            return;

        var object = this.getRowObject(row);
        object = this.getRealObject(object);
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    initialize: function()
    {
        this.objectPath = [];
        this.propertyPath = [];
        this.viewPath = [];
        this.pathIndex = -1;
        this.toggles = {};

        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        var view = this.viewPath[this.pathIndex];
        if (view && this.panelNode.scrollTop)
            view.scrollTop = this.panelNode.scrollTop;

        if (this.pathIndex)
            state.pathIndex = this.pathIndex;
        if (this.viewPath)
            state.viewPath = this.viewPath;
        if (this.propertyPath)
            state.propertyPath = this.propertyPath;

        if (this.propertyPath.length > 0 && !this.propertyPath[1])
            state.firstSelection = persistObject(this.getPathObject(1), this.context);

        Firebug.Panel.destroy.apply(this, arguments);
    },

    show: function(state)
    {
        if (this.context.loaded && !this.selection)
        {
            if (!state)
            {
                this.select(null);
                return;
            }
            if (state.viewPath)
                this.viewPath = state.viewPath;
            if (state.propertyPath)
                this.propertyPath = state.propertyPath;

            var selectObject = defaultObject = this.getDefaultSelection(this.context);

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
                this.objectPath = [defaultObject];

            if (this.propertyPath.length > 1)
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
                        this.objectPath.push(new Property(object, name));
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
            }

            var selection = state.pathIndex <= this.objectPath.length-1
                ? this.getPathObject(state.pathIndex)
                : this.getPathObject(this.objectPath.length-1);

            this.select(selection);
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
        return (enabled ? $STR("dom.Disable Break On Property Change") :
            $STR("dom.Break On Property Change"));
    },

    supportsObject: function(object)
    {
        if (object == null)
            return 1000;

        if (typeof(object) == "undefined")
            return 1000;
        else if (object instanceof SourceLink)
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
        var previousIndex = this.pathIndex;
        var previousView = previousIndex == -1 ? null : this.viewPath[previousIndex];

        var newPath = this.pathToAppend;
        delete this.pathToAppend;

        var pathIndex = this.findPathObject(object);
        if (newPath || pathIndex == -1)
        {
            this.toggles = {};

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
                        FBTrace.sysout("dom.updateSelection no pathObject for "+previousIndex+"\n");
                    return;
                }

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
                                FBTrace.sysout("dom.updateSelection FAILS at path_i="+i+" for name:"+name+"\n");
                        return;
                    }

                    ++this.pathIndex;
                    this.objectPath.push(new Property(object, name));
                    this.propertyPath.push(name);
                    this.viewPath.push({toggles: this.toggles, scrollTop: 0});
                }
            }
            else
            {
                this.toggles = {};

                var win = this.context.getGlobalScope();
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
                        {toggles: {}, scrollTop: 0},
                        {toggles: this.toggles, scrollTop: 0}
                    ];
                }
            }

            this.panelNode.scrollTop = 0;
            this.rebuild();
        }
        else
        {
            this.pathIndex = pathIndex;

            var view = this.viewPath[pathIndex];
            this.toggles = view ? view.toggles : {};

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
        return this.context.getGlobalScope();
    },

    updateOption: function(name, value)
    {
        const optionMap = {showUserProps: 1, showUserFuncs: 1, showDOMProps: 1,
            showDOMFuncs: 1, showDOMConstants: 1};
        if ( optionMap.hasOwnProperty(name) )
            this.rebuild(true);
    },

    getOptionsMenuItems: function()
    {
        return [
            optionMenu("ShowUserProps", "showUserProps"),
            optionMenu("ShowUserFuncs", "showUserFuncs"),
            optionMenu("ShowDOMProps", "showDOMProps"),
            optionMenu("ShowDOMFuncs", "showDOMFuncs"),
            optionMenu("ShowDOMConstants", "showDOMConstants"),
            "-",
            {label: "Refresh", command: bindFixed(this.rebuild, this, true) }
        ];
    },

    getContextMenuItems: function(object, target)
    {
        var row = getAncestorByClass(target, "memberRow");

        var items = [];

        if (row)
        {
            var rowName = getRowName(row);
            var rowObject = this.getRowObject(row);
            var rowValue = this.getRowPropertyValue(row);

            var isWatch = hasClass(row, "watchRow");
            var isStackFrame = rowObject instanceof jsdIStackFrame;

            items.push(
                "-",
                {label: "Copy Name",
                    command: bindFixed(this.copyName, this, row) },
                {label: "Copy Path",
                    command: bindFixed(this.copyPath, this, row) }
            );

            if (typeof(rowValue) == "string" || typeof(rowValue) == "number")
            {
                // Functions already have a copy item in their context menu
                items.push(
                    {label: "CopyValue",
                        command: bindFixed(this.copyProperty, this, row) }
                );
            }

            items.push(
                "-",
                {label: isWatch ? "EditWatch" : (isStackFrame ? "EditVariable" : "EditProperty"),
                    command: bindFixed(this.editProperty, this, row) }
            );

            if (isWatch || (!isStackFrame && !isDOMMember(rowObject, rowName)))
            {
                items.push(
                    {label: isWatch ? "DeleteWatch" : "DeleteProperty",
                        command: bindFixed(this.deleteProperty, this, row) }
                );
            }

            var member = row ? row.domObject : null;
            if (!isDOMMember(rowObject, rowName) && member && member.breakable)
            {
                items.push(
                    "-",
                    {label: "html.dom.label.Break On Property Change", type: "checkbox",
                        checked: this.context.dom.breakpoints.findBreakpoint(rowObject, rowName),
                        command: bindFixed(this.breakOnProperty, this, row)}
                );
            }
        }

        items.push(
            "-",
            {label: "Refresh", command: bindFixed(this.rebuild, this, true) }
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

// ************************************************************************************************

var DOMMainPanel = Firebug.DOMPanel = function () {};

Firebug.DOMPanel.DirTable = DirTablePlate;

DOMMainPanel.prototype = extend(Firebug.DOMBasePanel.prototype,
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
        if (hasClass(valueBox, "objectBox-array"))
        {
            var arrayIndex = FirebugReps.Arr.getItemIndex(target);
            this.pathToAppend.push(arrayIndex);
        }

        // Make sure we get a fresh status path for the object, since otherwise
        // it might find the object in the existing path and not refresh it
        Firebug.chrome.clearStatusPath();

        this.select(target.repObject, true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onClick: function(event)
    {
        var repNode = Firebug.getRepNode(event.target);
        if (repNode)
        {
            var row = getAncestorByClass(event.target, "memberRow");
            if (row)
            {
                this.selectRow(row, repNode);
                cancelEvent(event);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "dom",
    searchable: true,
    statusSeparator: ">",

    initialize: function()
    {
        this.onClick = bind(this.onClick, this);

        Firebug.DOMBasePanel.prototype.initialize.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        this.panelNode.addEventListener("click", this.onClick, false);
        dispatch([Firebug.A11yModel], 'onInitializeNode', [this, 'console']);
    },

    destroyNode: function()
    {
        this.panelNode.removeEventListener("click", this.onClick, false);
        dispatch([Firebug.A11yModel], 'onDestroyNode', [this, 'console']);
    },

    search: function(text, reverse)
    {
        if (!text)
        {
            delete this.currentSearch;
            this.highlightRow(null);
            return false;
        }

        var row;
        if (this.currentSearch && text == this.currentSearch.text)
            row = this.currentSearch.findNext(true, undefined, reverse, Firebug.Search.isCaseSensitive(text));
        else
        {
            function findRow(node) { return getAncestorByClass(node, "memberRow"); }
            this.currentSearch = new TextSearch(this.panelNode, findRow);
            row = this.currentSearch.find(text, reverse, Firebug.Search.isCaseSensitive(text));
        }

        if (row)
        {
            var sel = this.document.defaultView.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.currentSearch.range);

            scrollIntoCenterView(row, this.panelNode);

            this.highlightRow(row);
            dispatch([Firebug.A11yModel], 'onDomSearchMatchFound', [this, text, row]);
            return true;
        }
        else
        {
            dispatch([Firebug.A11yModel], 'onDomSearchMatchFound', [this, text, null]);
            return false;
        }
    }
});

// ************************************************************************************************

function DOMSidePanel() {}

DOMSidePanel.prototype = extend(Firebug.DOMBasePanel.prototype,
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "domSide",
    parentPanel: "html",
    order: 3,

    initializeNode: function(oldPanelNode)
    {
        dispatch([Firebug.A11yModel], 'onInitializeNode', [this, 'console']);
    },

    destroyNode: function()
    {
        dispatch([Firebug.A11yModel], 'onDestroyNode', [this, 'console']);
    },
});

// ************************************************************************************************

function WatchPanel() {}

WatchPanel.prototype = extend(Firebug.DOMBasePanel.prototype,
{
    tag: DirTablePlate.watchTag,

    rebuild: function()
    {
        this.updateSelection(this.selection);
    },

    showEmptyMembers: function()
    {
        this.tag.replace({domPanel: this, toggles: {}}, this.panelNode);
    },

    addWatch: function(expression)
    {
        if (!this.watches)
            this.watches = [];

        this.watches.splice(0, 0, expression);
        this.rebuild(true);
    },

    removeWatch: function(expression)
    {
        if (!this.watches)
            return;

        var index = this.watches.indexOf(expression);
        if (index != -1)
            this.watches.splice(index, 1);
    },

    editNewWatch: function(value)
    {
        var watchNewRow = getElementByClass(this.panelNode, "watchNewRow");
        if (watchNewRow)
            this.editProperty(watchNewRow, value);
    },

    setWatchValue: function(row, value)
    {
        var rowIndex = getWatchRowIndex(row);
        this.watches[rowIndex] = value;
        this.rebuild(true);
    },

    deleteWatch: function(row)
    {
        var rowIndex = getWatchRowIndex(row);
        this.watches.splice(rowIndex, 1);
        this.rebuild(true);

        this.context.setTimeout(bindFixed(function()
        {
            this.showToolbox(null);
        }, this));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    showToolbox: function(row)
    {
        var toolbox = this.getToolbox();
        if (row)
        {
            if (hasClass(row, "editing"))
                return;

            toolbox.watchRow = row;

            var offset = getClientOffset(row);
            toolbox.style.top = offset.y + "px";
            this.panelNode.appendChild(toolbox);
        }
        else
        {
            delete toolbox.watchRow;
            if (toolbox.parentNode)
                toolbox.parentNode.removeChild(toolbox);
        }
    },

    getToolbox: function()
    {
        if (!this.toolbox)
            this.toolbox = ToolboxPlate.tag.replace({domPanel: this}, this.document);

        return this.toolbox;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onMouseDown: function(event)
    {
        var watchNewRow = getAncestorByClass(event.target, "watchNewRow");
        if (watchNewRow)
        {
            this.editProperty(watchNewRow);
            cancelEvent(event);
        }
    },

    onMouseOver: function(event)
    {
        var watchRow = getAncestorByClass(event.target, "watchRow");
        if (watchRow)
            this.showToolbox(watchRow);
    },

    onMouseOut: function(event)
    {
        if (isAncestor(event.relatedTarget, this.getToolbox()))
            return;

        var watchRow = getAncestorByClass(event.relatedTarget, "watchRow");
        if (!watchRow)
            this.showToolbox(null);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "watches",
    order: 0,
    parentPanel: "script",

    initialize: function()
    {
        this.onMouseDown = bind(this.onMouseDown, this);
        this.onMouseOver = bind(this.onMouseOver, this);
        this.onMouseOut = bind(this.onMouseOut, this);

        Firebug.DOMBasePanel.prototype.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        state.watches = this.watches;

        Firebug.Panel.destroy.apply(this, arguments);
    },

    show: function(state)
    {
        if (state && state.watches)
            this.watches = state.watches;
    },

    initializeNode: function(oldPanelNode)
    {
        this.panelNode.addEventListener("mousedown", this.onMouseDown, false);
        this.panelNode.addEventListener("mouseover", this.onMouseOver, false);
        this.panelNode.addEventListener("mouseout", this.onMouseOut, false);
        dispatch([Firebug.A11yModel], "onInitializeNode", [this, 'console']);
    },

    destroyNode: function()
    {
        this.panelNode.removeEventListener("mousedown", this.onMouseDown, false);
        this.panelNode.removeEventListener("mouseover", this.onMouseOver, false);
        this.panelNode.removeEventListener("mouseout", this.onMouseOut, false);
        dispatch([Firebug.A11yModel], "onDestroyNode", [this, 'console']);
    },

    refresh: function()
    {
        this.rebuild(true);

    },

    updateSelection: function(object)
    {
        dispatch([Firebug.A11yModel], 'onBeforeDomUpdateSelection', [this]);
        var frame = this.context.currentFrame;

        var newFrame = frame && frame.isValid && frame.script != this.lastScript;
        if (newFrame)
        {
            this.toggles = {};
            this.lastScript = frame.script;
        }

        var members = [];

        if (this.watches)
        {
            for (var i = 0; i < this.watches.length; ++i)
            {
                var expr = this.watches[i];
                var value = null;
                Firebug.CommandLine.evaluate(expr, this.context, null, this.context.getGlobalScope(),
                    function success(result, context)
                    {
                        value = result;
                    },
                    function failed(result, context)
                    {
                        var exc = result;
                        value = new ErrorCopy(exc+"");
                    }
                );

                addMember(object, "watch", members, expr, value, 0);
            }
        }

        if (frame && frame.isValid)
        {
            var thisVar = unwrapIValue(frame.thisValue);
            addMember(object, "user", members, "this", thisVar, 0);

            var scopeChain = this.generateScopeChain(frame.scope);
            addMember(object, "scopes", members, "scopeChain", scopeChain, 0);

            members.push.apply(members, this.getMembers(scopeChain[0], 0, this.context));
        }

        this.expandMembers(members, this.toggles, 0, 0, this.context);
        this.showMembers(members, !newFrame);
    },

    generateScopeChain: function (scope)
    {
        var ret = [];
        while (scope) {
            var scopeVars;
            // getWrappedValue will not contain any variables for closure
            // scopes, so we want to special case this to get all variables
            // in all cases.
            if (scope.jsClassName == "Call") {
                scopeVars = {};
                var listValue = {value: null}, lengthValue = {value: 0};
                scope.getProperties(listValue, lengthValue);

                for (var i = 0; i < lengthValue.value; ++i)
                {
                    var prop = listValue.value[i];
                    var name = unwrapIValue(prop.name);
                    if (ignoreVars[name] == 1)
                    {
                        if (FBTrace.DBG_DOM)
                            FBTrace.sysout("dom.generateScopeChain: ignoreVars: " + name);
                        continue;
                    }

                    scopeVars[name] = unwrapIValue(prop.value);
                }
            } else {
                scopeVars = unwrapIValue(scope);
            }

            if (scopeVars && scopeVars.hasOwnProperty)
            {
                if (!scopeVars.hasOwnProperty("toString")) {
                    (function() {
                        var className = scope.jsClassName;
                        scopeVars.toString = function() {
                            return $STR(className + " Scope");
                        };
                    })();
                }

                ret.push(scopeVars);
            }
            else
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("dom .generateScopeChain: bad scopeVars");
            }
            scope = scope.jsParent;
        }

        ret.toString = function() {
            return $STR("Scope Chain");
        };

        return ret;
    },

});

// ************************************************************************************************
// Local Helpers

function DOMEditor(doc)
{
    this.box = this.tag.replace({}, doc, this);
    this.input = this.box;

    this.tabNavigation = false;
    this.tabCompletion = true;
    this.completeAsYouType = false;
    this.fixedWidth = true;

    this.autoCompleter = Firebug.CommandLine.autoCompleter;
}

DOMEditor.prototype = domplate(Firebug.InlineEditor.prototype,
{
    tag:
        INPUT({"class": "fixedWidthEditor a11yFocusNoTab",
            type: "text", title:$STR("NewWatch"),
            oninput: "$onInput", onkeypress: "$onKeyPress"}),

    endEditing: function(target, value, cancel)
    {
        // XXXjoe Kind of hackish - fix me
        delete this.panel.context.thisValue;

        if (cancel || value == "")
            return;

        var row = getAncestorByClass(target, "memberRow");
        dispatch([Firebug.A11yModel], 'onWatchEndEditing', [this.panel]);
        if (!row)
            this.panel.addWatch(value);
        else if (hasClass(row, "watchRow"))
            this.panel.setWatchValue(row, value);
        else
            this.panel.setPropertyValue(row, value);
    }
});

// ************************************************************************************************
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

function hasProperties(ob)
{
    try
    {
        for (var name in ob)
            return true;
    } catch (exc) {}
    return false;
}

function addMember(object, type, props, name, value, level, order, context)
{
    var rep = Firebug.getRep(value);    // do this first in case a call to instanceof reveals contents
    var tag = rep.shortTag ? rep.shortTag : rep.tag;

    var valueType = typeof(value);
    var hasChildren = hasProperties(value) && !(value instanceof ErrorCopy) &&
        (valueType == "function" || (valueType == "object" && value != null)
        || (valueType == "string" && value.length > Firebug.stringCropLength));

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
        tag: tag
    };

    // The context doesn't have to be specified (e.g. in case of Watch panel that is based
    // on the same template as the DOM panel, but doesn't show any breakpoints).
    if (context)
    {
        // xxxHonza: Support for object change not implemented yet.
        member.breakable = !hasChildren;

        // xxxHonza: Disable breaking on direct window properties, see #520572
        if (object instanceof Ci.nsIDOMWindow)
            member.breakable = false;

        var breakpoints = context.dom.breakpoints;
        var bp = breakpoints.findBreakpoint(object, name);
        if (bp)
        {
            member.breakpoint = true;
            member.disabledBreakpoint = !bp.checked;
        }
    }

    // If the property is implemented using a getter function (and there is no setter
    // implemented) use a "get" prefix that is displayed in the UI.
    var o = unwrapObject(object);
    member.prefix = (o.__lookupGetter__(name) && !o.__lookupSetter__(name)) ? "get " : "";

    props.push(member);
    return member;
}

function getWatchRowIndex(row)
{
    var index = -1;
    for (; row && hasClass(row, "watchRow"); row = row.previousSibling)
        ++index;
    return index;
}

function getRowName(row)
{
    var labelNode = getElementByClass(row, "memberLabelCell");
    return labelNode.textContent;
}

function getRowValue(row)
{
    var valueNode = getElementByClass(row, "memberValueCell");
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
    var level = parseInt(row.getAttribute("level"))-1;
    for (row = row.previousSibling; row; row = row.previousSibling)
    {
        if (parseInt(row.getAttribute("level")) == level)
            return row;
    }
}

function getPath(row)
{
    var name = getRowName(row);
    var path = [name];

    var level = parseInt(row.getAttribute("level"))-1;
    for (row = row.previousSibling; row; row = row.previousSibling)
    {
        if (parseInt(row.getAttribute("level")) == level)
        {
            var name = getRowName(row);
            path.splice(0, 0, name);

            --level;
        }
    }

    return path;
}

function findRow(parentNode, object)
{
    var rows = getElementsByClass(parentNode, "memberRow");
    for (var i=0; i<rows.length; i++)
    {
        var row = rows[i];
        if (object == row.domObject.object)
            return row;
    }

    return row;
}

// ************************************************************************************************

Firebug.DOMModule.DebuggerListener =
{
    getBreakpoints: function(context, groups)
    {
        if (!context.dom.breakpoints.isEmpty())
            groups.push(context.dom.breakpoints);
    }
};

Firebug.DOMModule.BreakpointRep = domplate(Firebug.Rep,
{
    inspectable: false,

    tag:
        DIV({"class": "breakpointRow focusRow", _repObject: "$bp",
            role: "option", "aria-checked": "$bp.checked"},
            DIV({"class": "breakpointBlockHead", onclick: "$onEnable"},
                INPUT({"class": "breakpointCheckbox", type: "checkbox",
                    _checked: "$bp.checked", tabindex : "-1"}),
                SPAN({"class": "breakpointName"}, "$bp.propName"),
                IMG({"class": "closeButton", src: "blank.gif", onclick: "$onRemove"})
            ),
            DIV({"class": "breakpointCode"},
                TAG("$bp.object|getObjectTag", {object: "$bp.object"})
            )
        ),

    getObjectTag: function(object)
    {
        var rep = Firebug.getRep(object);
        return rep.shortTag ? rep.shortTag : rep.tag;
    },

    onRemove: function(event)
    {
        cancelEvent(event);

        if (!hasClass(event.target, "closeButton"))
            return;

        var bpPanel = Firebug.getElementPanel(event.target);
        var context = bpPanel.context;

        // Remove from list of breakpoints.
        var row = getAncestorByClass(event.target, "breakpointRow");
        var bp = row.repObject;
        context.dom.breakpoints.removeBreakpoint(bp.object, bp.propName);

        // Remove from the UI.
        bpPanel.noRefresh = true;
        bpPanel.removeRow(row);
        bpPanel.noRefresh = false;

        var domPanel = context.getPanel("dom", true);
        if (domPanel)
        {
            var domRow = findRow(domPanel.panelNode, bp.object);
            if (domRow)
            {
                domRow.removeAttribute("breakpoint");
                domRow.removeAttribute("disabledBreakpoint");
            }
        }
    },

    onEnable: function(event)
    {
        var checkBox = event.target;
        if (!hasClass(checkBox, "breakpointCheckbox"))
            return;

        var bpPanel = Firebug.getElementPanel(event.target);
        var context = bpPanel.context;

        var bp = getAncestorByClass(checkBox, "breakpointRow").repObject;
        bp.checked = checkBox.checked;

        var domPanel = context.getPanel("dom", true);
        if (domPanel)
        {
            var row = findRow(domPanel.panelNode, bp.object);
            if (row)
                row.setAttribute("disabledBreakpoint", bp.checked ? "false" : "true");
        }
    },

    supportsObject: function(object)
    {
        return object instanceof Breakpoint;
    }
});

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function Breakpoint(object, propName, objectPath, context)
{
    this.context = context;
    this.propName = propName;
    this.objectPath = objectPath;
    this.object = object;
    this.checked = true;
}

Breakpoint.prototype =
{
    watchProperty: function()
    {
        if (FBTrace.DBG_DOM)
            FBTrace.sysout("dom.watch; property: " + this.propName);

        if (!this.object)
            return;

        try
        {
            var self = this;
            this.object.watch(this.propName, function handler(prop, oldval, newval)
            {
                // XXXjjb Beware: in playing with this feature I hit too much recursion multiple times with console.log
                // TODO Do something cute in the UI with the error bubble thing
                if (self.checked)
                {
                    self.context.breakingCause = {
                        title: $STR("dom.Break On Property"),
                        message: cropString(prop, 200),
                        prevValue: oldval,
                        newValue: newval
                    };

                    Firebug.Breakpoint.breakNow(self.context.getPanel("dom", true));
                }
                return newval;
            });
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("dom.watch; object FAILS " + exc, exc);
            return false;
        }

        return true;
    },

    unwatchProperty: function()
    {
        if (FBTrace.DBG_DOM)
            FBTrace.sysout("dom.unwatch; property: " + this.propName, this.object);

        if (!this.object)
            return;

        try
        {
            this.object.unwatch(this.propName);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("dom.unwatch; object FAILS " + exc, exc);
        }
    }
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function DOMBreakpointGroup()
{
    this.breakpoints = [];
}

DOMBreakpointGroup.prototype = extend(new Firebug.Breakpoint.BreakpointGroup(),
{
    name: "domBreakpoints",
    title: $STR("dom.label.DOM Breakpoints"),

    addBreakpoint: function(object, propName, panel, row)
    {
        var path = panel.getPropertyPath(row);
        path.pop();

        // We don't want the last dot.
        if (path.length > 0 && path[path.length-1] == ".")
            path.pop();

        var objectPath = path.join("");
        if (FBTrace.DBG_DOM)
            FBTrace.sysout("dom.addBreakpoint; " + objectPath, path);

        var bp = new Breakpoint(object, propName, objectPath, panel.context);
        if (bp.watchProperty());
            this.breakpoints.push(bp);
    },

    removeBreakpoint: function(object, propName)
    {
        var bp = this.findBreakpoint(object, propName);
        if (bp)
        {
            bp.unwatchProperty();
            remove(this.breakpoints, bp);
        }
    },

    matchBreakpoint: function(bp, args)
    {
        var object = args[0];
        var propName = args[1];
        return bp.object == object && bp.propName == propName;
    },

    // Persistence
    load: function(context)
    {
        var panelState = getPersistedState(context, "dom");
        if (panelState.breakpoints)
            this.breakpoints = panelState.breakpoints;

        this.enumerateBreakpoints(function(bp)
        {
            try
            {
                // xxxHonza: Firebug.CommandLine.evaluate should be reused if possible.
                // xxxJJB: The Components.utils.evalInSandbox fails from some reason.
                var expr = "context.window.wrappedJSObject." + bp.objectPath;
                bp.object = eval(expr);
                bp.watchProperty();

                if (FBTrace.DBG_DOM)
                    FBTrace.sysout("dom.DOMBreakpointGroup.load; " + bp.objectPath, bp);
            }
            catch (err)
            {
                if (FBTrace.DBG_ERROR || FBTrace.DBG_DOM)
                    FBTrace.sysout("dom.DOMBreakpointGroup.load; ERROR " + bp.objectPath, err);
            }
        });
    },

    store: function(context)
    {
        this.enumerateBreakpoints(function(bp)
        {
            bp.object = null;
        });

        var panelState = getPersistedState(context, "dom");
        panelState.breakpoints = this.breakpoints;
    },
});

// ************************************************************************************************

Firebug.registerModule(Firebug.DOMModule);
Firebug.registerPanel(DOMMainPanel);
Firebug.registerPanel(DOMSidePanel);
Firebug.registerPanel(WatchPanel);
Firebug.registerRep(Firebug.DOMModule.BreakpointRep);

// ************************************************************************************************

}});

