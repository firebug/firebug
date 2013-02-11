/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/array",
],
function(Obj, Firebug, Domplate, Events, Dom, Css, Arr) {
with (Domplate) {

// ********************************************************************************************* //
// DOM Tree Implementation

function DomTree(provider)
{
    this.provider = provider;
}

/**
 * @domplate This object represents UI DomTree widget based on Domplate. You can use
 * data provider to populate the tree with custom data. Or just pass a JS object as
 * an input.
 */
DomTree.prototype = domplate(
/** @lends DomTree */
{
    sizerRowTag:
        TR({role: "presentation"},
            TD({width: "30%"}),
            TD({width: "70%"})
        ),

    tag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick"},
            TBODY(
                FOR("member", "$object|memberIterator",
                    TAG("$member|getRowTag", {member: "$member"}))
            )
        ),

    rowTag:
        TR({"class": "memberRow $member.open $member.type\\Row",
            $hasChildren: "$member|hasChildren",
            _repObject: "$member", level: "$member.level"},
            TD({"class": "memberLabelCell", style: "padding-left: $member|getIndent\\px"},
                SPAN({"class": "memberLabel $member.type\\Label"}, "$member|getLabel")
            ),
            TD({"class": "memberValueCell"},
                TAG("$member|getValueTag", {object: "$member|getValue"})
            )
        ),

    loop:
        FOR("member", "$members", 
            TAG("$member|getRowTag", {member: "$member"})),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Domplate Accessors

    hasChildren: function(member)
    {
        return member.hasChildren ? "hasChildren" : "";
    },

    getIndent: function(member)
    {
        return member.level * 16;
    },

    getLabel: function(member)
    {
        if (member.provider)
            return member.provider.getLabel(member.value);

        return member.name;
    },

    getValue: function(member)
    {
        if (member.provider)
        {
            var value = member.provider.getValue(member.value);
            if (isPromise(value))
                return member.tree.resolvePromise(value, member.value);

            return value;
        }

        return member.value;
    },

    getValueTag: function(member)
    {
        // xxxHonza: |this| is wrong at this moment (callback from Domplate uses wrong context).
        // That's why we access the provider through the 'member' object.
        // xxxHonza: It should be possible to provide the tag through a decorator or provider.

        // Get proper template for the value. |member.value| should refer to remote
        // object implementation.
        var valueTag = Firebug.getRep(member.value);
        return valueTag.tag;
    },

    getRowTag: function(member)
    {
        return this.rowTag;
    },

    getSizerRowTag: function()
    {
        return this.sizerRowTag;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Domplate Event Handlers

    onClick: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        var row = Dom.getAncestorByClass(event.target, "memberRow");
        var label = Dom.getAncestorByClass(event.target, "memberLabel");
        if (label && Css.hasClass(row, "hasChildren"))
            this.toggleRow(row);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    toggleRow: function(row, forceOpen)
    {
        if (!row)
            return;

        var level = parseInt(row.getAttribute("level"));
        if (forceOpen && Css.hasClass(row, "opened"))
            return;

        if (Css.hasClass(row, "opened"))
        {
            Css.removeClass(row, "opened");

            var tbody = row.parentNode;
            for (var firstRow = row.nextSibling; firstRow; firstRow = row.nextSibling)
            {
                if (parseInt(firstRow.getAttribute("level")) <= level)
                    break;

                tbody.removeChild(firstRow);
            }
        }
        else
        {
            var member = row.repObject;
            if (member)
            {
                // Do not expand if the member says there are no children.
                if (!member.hasChildren)
                    return;

                Css.setClass(row, "opened");

                // Get children object for the next level.
                var members = this.getMembers(member.value, level + 1);

                // Insert rows if they are immediatelly available. Otherwise set a spinner
                // and wait for the update.
                if (members && members.length)
                    this.loop.insertRows({members: members}, row, this);
                else if (isPromise(members))
                    Css.setClass(row, "spinning");
            }
        }
    },

    memberIterator: function(object)
    {
        return this.getMembers(object);
    },

    getMembers: function(object, level)
    {
        if (!level)
            level = 0;

        var members = [];

        if (this.provider)
        {
            // Use data provider if it's available.
            var children = this.fetchChildren(object);
            if (isPromise(children))
                return children;

            for (var i=0; i<children.length; i++)
            {
                var child = children[i];
                var hasChildren = this.provider.hasChildren(child);
                var type = this.getType(child);

                var member = this.createMember(type, null, child, level, hasChildren);
                member.provider = this.provider;
                member.tree = this; // Domplate derivation doesn't work properly
                members.push(member);
            }
        }
        else
        {
            // If there is no provider, iterate the object properties.
            // xxxHonza: Introduce an interator that is customizable (e.g. from derived objects)
            for (var p in object)
            {
                var value = object[p];
                var valueType = typeof(value);
                var hasChildren = (valueType === "object" && this.hasProperties(value));
                var type = this.getType(value);

                members.push(this.createMember(type, p, value, level, hasChildren));
            }
        }

        return members;
    },

    fetchChildren: function(object)
    {
        var children = [];

        try
        {
            children = this.provider.getChildren(object);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("domTree.fetchChildren; EXCEPTION " + e, e);

            return children;
        }

        if (isPromise(children))
            return this.resolvePromise(children, object);

        return children;
    },

    getType: function(object)
    {
        // Type is used for UI decoration of a tree row.
        // A 'decorator' should be introduced for these things. This object should be
        // used to change style of a row like for example: append icons, badges, prefixes, etc.
        // xxxHonza: Use Decorator pattern and introduce a Decorator interface.
        // var Decorator =
        // {
        //     decorateLabel: function(object),
        //     decorateStyle: function(object),
        // }
        //
        // return this.decorator.decorateStyle(object);

        return "dom";
    },

    createMember: function(type, name, value, level, hasChildren)
    {
        var member = {
            name: name,
            type: type,
            rowClass: "memberRow-" + type,
            open: "",
            level: level,
            hasChildren: hasChildren,
            value: value,
        };

        return member;
    },

    hasProperties: function(ob)
    {
        if (typeof(ob) == "string")
            return false;

        try {
            for (var name in ob)
                return true;
        } catch (exc) {}
        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getRow: function(object)
    {
        // If not rendered yet, bail out.
        if (!this.element)
            return;

        // Iterate all existing rows and expand the one associated with specified object.
        // The repObject is a "member" object created in createMember method.
        var rows = Dom.getElementsByClass(this.element, "memberRow");
        for (var i=0; i<rows.length; i++)
        {
            var row = rows[i];
            var member = row.repObject;
            if (member.value == object)
                return row;
        }

        return null;
    },

    resolvePromise: function(promise, object)
    {
        var result;

        // This flag is used to differentiate sync and async scenario.
        var sync = true;

        // The callback can be executed immediately if children are provided
        // synchronously. In such case, 'arr' is immediately used as the result value.
        // The object (i.e. the associated row) is updated later in asynchronous scenario.
        var self = this;
        var promise = promise.then(function onThen(value)
        {
            if (FBTrace.DBG_DOMTREE)
            {
                FBTrace.sysout("domTree.onThen; sync: " + sync,
                    {value: value, object: object});
            }

            if (sync)
                result = value;
            else
                self.updateObject(object); // xxxHonza: value should be passed too

        },
        function onError(err)
        {
            FBTrace.sysout("domTree.onResolvePromise; ERROR " + err, err);
        });

        sync = false;

        return result || promise;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public

    replace: function(parentNode, input)
    {
        Dom.clearNode(parentNode);
        this.append(parentNode, input);
    },

    append: function(parentNode, input)
    {
        this.parentNode = parentNode;

        this.element = this.tag.append(input, parentNode, this);
        this.element.repObject = this;

        this.input = input;

        // Expand the first node (root) by default
        // Do not expand if the root is an array with more than one element.
        var value = Arr.isArray(input) && input.length > 2;
        var firstRow = this.element.firstChild.firstChild;
        if (firstRow && !value)
            this.toggleRow(firstRow);
    },

    expandObject: function(object)
    {
        var row = this.getRow(object);
        if (!row)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("domTree.expandObject; ERROR no such object", object);
            return;
        }

        this.toggleRow(row, true);
        return row;
    },

    collapseObject: function(object)
    {
        var row = this.getRow(object);
        if (Css.hasClass(row, "opened"))
            this.toggleRow(row);
        return row;
    },

    updateObject: function(object)
    {
        try
        {
            this.doUpdateObject(object);
        }
        catch (e)
        {
            FBTrace.sysout("domTree.updateObject; EXCEPTION " + e, e);
        }
    },

    doUpdateObject: function(object)
    {
        if (FBTrace.DBG_DOMTREE)
            FBTrace.sysout("domTree.updateObject;", object);

        var row = this.getRow(object);

        // The input.object itself (the root) doesn't have a row.
        if (this.input.object == object)
        {
            var members = this.getMembers(object); // xxxHonza: what about level?
            if (members)
                this.loop.insertRows({members: members}, this.element.firstChild, this);
            return;
        }

        // Root will always bail out.
        if (!row)
        {
            FBTrace.sysout("domTree.updateObject; This object can't be updated", object);
            return;
        }

        var member = row.repObject;
        member.hasChildren = this.provider.hasChildren(object);

        // If the old row was expanded remember the state. We want to expand it again after
        // the row itself is updated. Do not forget to remove the existing child rows (by
        // collapsing the row), they will be regenerated.
        var expanded = Css.hasClass(row, "opened");
        if (expanded)
            this.toggleRow(row);

        // Generate new row with new value.
        var rowTag = this.getRowTag();
        var rows = rowTag.insertRows({member: member}, row, this);

        // Remove the old row before dealing (expanding) the new updated row. 
        // Otherwise the old one would be used since it's associated with the same rep object.
        row.parentNode.removeChild(row);

        if (expanded)
        {
            // Expand if it was expanded and the flag still says there are
            // some children. Otherwise close the row.
            if (member.hasChildren)
                this.expandObject(object);
            else
                this.collapseObject(object);
        }
    }
});

// ********************************************************************************************* //
// Helpers

function isPromise(object)
{
    return object && typeof(object.then) == "function";
}

// ********************************************************************************************* //
// Registration

return DomTree;

// ********************************************************************************************* //
}});

