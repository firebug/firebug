/* See license.txt for terms of usage */

FBTestApp.ns( /** @scope _propTree_ */ function() { with (FBL) {

// ************************************************************************************************
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

// ************************************************************************************************
// Simple Property Tree Widget
// xxxHonza: duplicated in FBTrace, should be a common widget available in Firebug

// ************************************************************************************************
// Domplate helpers - Tree (domplate widget)

/**
 * This object is intended as a domplate widget for displaying hierarchical
 * structure (tree). Specific tree should be derived from this object and
 * getMembers method should be implemented.
 * 
 * @domplate  
 */
FBTestApp.Tree = domplate(Firebug.Rep,
/** @lends FBTestApp.Tree */
{
    tag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick"},
            TBODY(
                FOR("member", "$object|memberIterator",
                    TAG("$member|getRowTag", {member: "$member"}))
            )
        ),

    rowTag:
        TR({"class": "memberRow $member.open $member.type\\Row", $hasChildren: "$member.hasChildren",
            _repObject: "$member", level: "$member.level"},
            TD({"class": "memberLabelCell",
                style: "padding-left: $member.indent\\px; width:1%; white-space: nowrap"},
                DIV({"class": "memberLabel $member.type\\Label"}, "$member.name")
            ),
            TD({"class": "memberValueCell", style: "width: 100%;"},
                TAG("$member.tag", {object: "$member.value"})
            )
        ),

    loop:
        FOR("member", "$members",
            TAG("$member|getRowTag", {member: "$member"})),

    memberIterator: function(object)
    {
        return this.getMembers(object);
    },

    getRowTag: function(member)
    {
        return this.rowTag;
    },

    onClick: function(event)
    {
        if (!isLeftClick(event))
            return;

        var row = getAncestorByClass(event.target, "memberRow");
        var label = getAncestorByClass(event.target, "memberLabel");
        if (label && hasClass(row, "hasChildren"))
            this.toggleRow(row);
    },

    toggleRow: function(row)
    {
        var level = parseInt(row.getAttribute("level"));
        var target = row.lastChild.firstChild;
        var isString = hasClass(target,"objectBox-string");
        var repObject = row.repObject;

        if (hasClass(row, "opened"))
        {
            removeClass(row, "opened");
            if (isString)
            {
                var rowValue = repObject.value;
                row.lastChild.firstChild.textContent = '"' + cropMultipleLines(rowValue) + '"';
            }
            else
            {
                var tbody = row.parentNode;
                for (var firstRow = row.nextSibling; firstRow; firstRow = row.nextSibling) {
                    if (parseInt(firstRow.getAttribute("level")) <= level)
                        break;

                    tbody.removeChild(firstRow);
                }
            }
        }
        else
        {
            setClass(row, "opened");
            if (isString)
            {
                var rowValue = repObject.value;
                row.lastChild.firstChild.textContent = '"' + rowValue + '"';
            }
            else
            {
                if (repObject) {
                    var members = this.getMembers(repObject.value, level+1);
                    if (members)
                        this.loop.insertRows({members: members}, row);
                }
            }
        }
    },

    getMembers: function(object, level)
    {
        if (!level)
            level = 0;

        if (typeof(object) == "string")
            return [this.createMember("", "", object, level)];

        var members = [];
        for (var p in object) {
            var member = this.createMember("", p, object[p], level);
            if (object[p] instanceof Array)
                member.tag = FirebugReps.Nada.tag;
            members.push(member);
        }
        return members;
    },

    createMember: function(type, name, value, level)
    {
        var rep = Firebug.getRep(value);
        var tag = rep.shortTag ? rep.shortTag : rep.tag;
        var valueType = typeof(value);

        var hasChildren = hasProperties(value) && !(value instanceof FirebugReps.ErrorCopy) &&
            (valueType == "function" || (valueType == "object" && value != null)
            || (valueType == "string" && value.length > Firebug.stringCropLength));

        return {
            name: name,
            value: value,
            type: type,
            rowClass: "memberRow-" + type,
            open: "",
            level: level,
            indent: level*16,
            hasChildren: hasChildren,
            tag: tag
        };
    }
});

// ************************************************************************************************

/** @domplate */
FBTestApp.PropertyTree = domplate(FBTestApp.Tree,
/** @lends FBTestApp.PropertyTree */
{
    getMembers: function(object, level)
    {
        if (!level)
            level = 0;

        try
        {
            var members = [];
            for (var p in object)
            {
                try
                {
                    members.push(this.createMember("dom", p, object[p], level));
                }
                catch (e)
                {
                }
            }
        }
        catch (err)
        {
        }

        return members;
    }
});

// ************************************************************************************************
}});
