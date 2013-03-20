/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/array",
    "firebug/lib/string",
    "firebug/lib/trace",
    "firebug/chrome/domTree",
    "firebug/dom/toggleBranch",
    "firebug/lib/promise",
],
function(Obj, Domplate, Dom, Css, Arr, Str, FBTrace, DomTree, ToggleBranch, Promise) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_DOMBASETREE");
var TraceError = FBTrace.to("DBG_ERRORS");

const insertSliceSize = 18;
const insertInterval = 40;

// ********************************************************************************************* //
// DOM Tree Implementation

function DomBaseTree()
{
}

/**
 * @domplate This tree widget is derived from basic {@DomTree} and appends logic such as:
 * 1) Long string expansion
 * 2) State persistence
 * 3) Asynchronous population (so, the UI doesn't freeze when an item is exapanded and
 *    there is a lot of children)
 */
var BaseTree = DomTree.prototype;
DomBaseTree.prototype = domplate(BaseTree,
/** @lends DomBaseTree */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Persistence

    saveState: function(state)
    {
        if (!this.element)
            return;

        var rows = this.element.querySelectorAll(".memberRow.opened");
        for (var i=0; i<rows.length; i++)
        {
            var row = rows[i];
            var path = this.getPath(row);

            // Mark the path in the toggle tree
            var toggles = state;
            for (var j=0; j<path.length; ++j)
            {
                var name = path[j];
                if (toggles.get(name))
                    toggles = toggles.get(name);
                else
                    toggles = toggles.set(name, new ToggleBranch.ToggleBranch());
            }
        }
    },

    restoreState: function(object, toggles, level)
    {
        level = level || 0;

        // Don't try to expand children if there are no expanded items.
        if (toggles.isEmpty())
            return;

        // Async restore handler for recursion (see the loop below).
        var onRestore = function(value, toggles, level)
        {
            this.restoreState(value, toggles, level);
        }

        var rows = this.getChildRows(object, level);
        for (var i=0; i<rows.length; i++)
        {
            var row = rows[i];
            var member = row.repObject;
            if (!member)
                continue;

            // Don't expand if the member doesn't have children any more.
            if (!member.hasChildren)
                continue;

            var name = this.getRowName(row);

            var newToggles = toggles.get(name);
            if (!newToggles)
                continue;

            toggles.remove(name);

            // Get the member's object (the value) and expand it.
            var value = member.value;
            var promise = this.expandObject(value);

            // If no children are expanded bail out.
            if (newToggles.isEmpty())
                continue;

            if (!promise)
            {
                TraceError.sysout("domBaseTree.restoreState; No promise!?");
                continue;
            }

            // Bind the handler to the current arguments. They can change
            // within the loop. The handler will be executed as soon as the
            // promise is resolved.
            promise.then(onRestore.bind(this, value, newToggles, level+1));
        }
    },

    getChildRows: function(object, level)
    {
        var rows = [];

        var row = this.getRow(object);
        if (!row && !level)
            row = this.element.firstChild.firstChild;

        if (!row)
            return rows;

        for (var firstRow = row.nextSibling; firstRow; firstRow = firstRow.nextSibling)
        {
            if (this.getRowLevel(firstRow) == level)
                rows.push(firstRow);
        }

        return rows;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Expanding/Collapsing

    toggleRow: function(row, forceOpen)
    {
        if (!row)
            return;

        var member = row.repObject;
        if (!member)
            return;

        var level = this.getRowLevel(row);
        if (forceOpen && Css.hasClass(row, "opened"))
            return;

        // Handle long strings. These don't have children, but can be shortened and
        // expanding them allows the user to see the entire string.
        var rowValue = this.getValue(member);
        var isString = typeof(rowValue) == "string";
        if (isString)
        {
            if (Css.hasClass(row, "opened"))
            {
                Css.removeClass(row, "opened");
                row.lastChild.firstChild.textContent = '"' + Str.cropMultipleLines(rowValue) + '"';
            }
            else
            {
                Css.setClass(row, "opened");
                row.lastChild.firstChild.textContent = '"' + rowValue + '"';
            }

            return;
        }

        // Owerwrite the default child items expanding/collapsing and implement
        // asynchronous logic (so the UI doesn't freeze if there is huge amount
        // of items).
        if (Css.hasClass(row, "opened"))
        {
            Css.removeClass(row, "opened");

            this.collapseRowAsync(row);
        }
        else
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
            {
                return this.expandRowAsync(row, members);
            }
            else if (isPromise(members))
            {
                Css.setClass(row, "spinning");
                return members;
            }
        }
    },

    expandRowAsync: function(row, members)
    {
        var loop = this.loop;
        var lastRow = row;

        var delay = 0;
        var setSize = members.length;
        var rowCount = 1;

        var deferred = Promise.defer();

        // xxxHonza: the logic should be improved
        // The while loop generates bunch if timeouts in advance and if the row is
        // collapsed before it's fully expanded they are not necessary.
        while (members.length)
        {
            var slice = members.splice(0, insertSliceSize);
            var isLast = !members.length;

            setTimeout(function()
            {
                if (lastRow.parentNode)
                {
                    var result = loop.insertRows({members: slice}, lastRow);
                    lastRow = result[1];

                    //xxxHonza: for a11y
                    //Events.dispatch(DOMModule.fbListeners, "onMemberRowSliceAdded",
                    //    [null, result, rowCount, setSize]);

                    rowCount += insertSliceSize;
                }

                if (isLast)
                {
                    delete row.insertTimeout;
                    deferred.resolve(lastRow);
                }

            }, delay);

            delay += insertInterval;
        }

        row.insertTimeout = delay;

        return deferred.promise;
    },

    collapseRowAsync: function(row)
    {
        var level = this.getRowLevel(row);
        var tbody = row.parentNode;
        var timeout = row.insertTimeout ? row.insertTimeout : 0;

        var self = this;
        setTimeout(function()
        {
            for (var firstRow = row.nextSibling; firstRow; firstRow = row.nextSibling)
            {
                if (self.getRowLevel(firstRow) <= level)
                    break;
                tbody.removeChild(firstRow);
            }
        }, timeout);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getPath: function(row)
    {
        var name = this.getRowName(row);
        var path = [name];

        var level = this.getRowLevel(row) - 1;
        for (row = row.previousSibling; row && level >= 0; row = row.previousSibling)
        {
            if (this.getRowLevel(row) === level)
            {
                name = this.getRowName(row);
                path.splice(0, 0, name);

                --level;
            }
        }

        return path;
    },

    getRowName: function(row)
    {
        var member = row.repObject;
        var name = this.provider.getId(member.value);

        if (!name)
            name = member.name;

        return name;
    }
});

// ********************************************************************************************* //
// Registration

return DomBaseTree;

// ********************************************************************************************* //
}});

