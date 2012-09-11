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
 * @domplate Represents a tree of properties/objects
 */
DomTree.prototype = domplate(
{
    sizerRow:
        TR({role: "presentation"},
            TD(),
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
        TR({"class": "memberRow $member.open $member.type\\Row $member|hasChildren", 
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
    // Member Accessors

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
            return member.provider.getValue(member.value);

        return member.value;
    },

    getValueTag: function(member)
    {
        // Get proper UI template for the value.
        var value = this.getValue(member);
        var valueTag = Firebug.getRep(value);
        return valueTag.tag;
    },

    getRowTag: function(member)
    {
        return this.rowTag;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Evenet Handlers

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
            Css.setClass(row, "opened");

            var member = row.repObject;
            if (member)
            {
                if (!member.hasChildren)
                    return;

                var members = this.getMembers(member.value, level+1);
                if (members)
                    this.loop.insertRows({members: members}, row, this);
                else
                    Lib.setClass(row, "spinning");
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
            var children = this.provider.getChildren(object);
            for (var i=0; i<children.length; i++)
            {
                var child = children[i];
                var hasChildren = this.provider.hasChildren(child);

                var member = this.createMember("dom", null, child, level, hasChildren);
                member.provider = this.provider;
                members.push(member);
            }
            return members;
        }

        for (var p in object)
        {
            var value = object[p];
            var valueType = typeof(value);
            var hasChildren = this.hasProperties(value) && (valueType == "object");

            members.push(this.createMember("dom", p, value, level, hasChildren));
        }

        return members;
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

    expandRow: function(object)
    {
        var row = this.getRow(object);
        this.toggleRow(row, true);
        return row;
    },

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

    updateObject: function(object)
    {
        var row = this.getRow(object);

        // The input object itself doesn't have a row.
        if (this.input == object)
        {
            var members = this.getMembers(object);
            if (members)
                this.loop.insertRows({members: members}, this.element.firstChild);
            return;
        }

        if (!row)
            return;

        var member = row.repObject;
        member.hasChildren = this.provider.hasChildren(object);

        // Generate new row with new value.
        var rowTag = this.getRowTag();
        var rows = rowTag.insertRows({member: member}, row, this);

        // If the old row was expanded remember it.
        var expanded = Css.hasClass(row, "opened");

        // Remove the old row before expanding the new row,otherwise the old one
        // would be expanded and consequently removed.
        row.parentNode.removeChild(row);

        if (expanded)
            this.expandRow(object);

        Css.removeClass(row, "spinning");
    }
});

// ********************************************************************************************* //
// Registration

return DomTree;

// ********************************************************************************************* //
}});

