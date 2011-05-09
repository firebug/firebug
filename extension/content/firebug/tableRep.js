/* See license.txt for terms of usage */

define([
    "firebug/lib",
    "firebug/domplate",
    "firebug/lib/locale",
    "firebug/reps"
],
function(FBL, Domplate, Locale, FirebugReps) {

// ************************************************************************************************
// Constants

// ************************************************************************************************

with (Domplate) {
FirebugReps.Table = domplate(Firebug.Rep,
{
    className: "table",

    tag:
        DIV({"class": "dataTableSizer", "tabindex": "-1" },
            TABLE({"class": "dataTable", cellspacing: 0, cellpadding: 0, width: "100%",
                "role": "grid"},
                THEAD({"class": "dataTableThead", "role": "presentation"},
                    TR({"class": "headerRow focusRow dataTableRow subFocusRow", "role": "row",
                        onclick: "$onClickHeader"},
                        FOR("column", "$object.columns",
                            TH({"class": "headerCell a11yFocus", "role": "columnheader",
                                $alphaValue: "$column.alphaValue"},
                                DIV({"class": "headerCellBox"},
                                    "$column.label"
                                )
                            )
                        )
                    )
                ),
                TBODY({"class": "dataTableTbody", "role": "presentation"},
                    FOR("row", "$object.data|getRows",
                        TR({"class": "focusRow dataTableRow subFocusRow", "role": "row"},
                            FOR("column", "$row|getColumns",
                                TD({"class": "a11yFocus dataTableCell", "role": "gridcell"},
                                    TAG("$column|getValueTag", {object: "$column"})
                                )
                            )
                        )
                    )
                )
            )
        ),

    getValueTag: function(object)
    {
        var rep = Firebug.getRep(object);
        return rep.shortTag || rep.tag;
    },

    getRows: function(data)
    {
        var props = this.getProps(data);
        if (!props.length)
            return [];
        return props;
    },

    getColumns: function(row)
    {
        if (typeof(row) != "object")
            return [row];

        var cols = [];
        for (var i=0; i<this.columns.length; i++)
        {
            var prop = this.columns[i].property;
            
            if (typeof row[prop] === "undefined")
            {
                var props = (typeof(prop) == "string") ? prop.split(".") : [prop];

                var value = row;
                for (var p in props)
                    value = (value && value[props[p]]) || undefined;
            }
            else
            {
                value = row[prop];
            }

            cols.push(value);
        }
        return cols;
    },

    getProps: function(obj)
    {
        if (typeof(obj) != "object")
            return [obj];

        if (obj.length)
            return FBL.cloneArray(obj);

        var arr = [];
        for (var p in obj)
        {
            var value = obj[p];
            if (this.domFilter(value, p))
                arr.push(value);
        }
        return arr;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Sorting

    onClickHeader: function(event)
    {
        var table = FBL.getAncestorByClass(event.target, "dataTable");
        var header = FBL.getAncestorByClass(event.target, "headerCell");
        if (!header)
            return;

        var numerical = !FBL.hasClass(header, "alphaValue");

        var colIndex = 0;
        for (header = header.previousSibling; header; header = header.previousSibling)
            ++colIndex;

        this.sort(table, colIndex, numerical);
    },

    sort: function(table, colIndex, numerical)
    {
        var tbody = FBL.getChildByClass(table, "dataTableTbody");
        var thead = FBL.getChildByClass(table, "dataTableThead");

        var values = [];
        for (var row = tbody.childNodes[0]; row; row = row.nextSibling)
        {
            var cell = row.childNodes[colIndex];
            var value = numerical ? parseFloat(cell.textContent) : cell.textContent;
            values.push({row: row, value: value});
        }

        values.sort(function(a, b) { return a.value < b.value ? -1 : 1; });

        var headerRow = thead.firstChild;
        var headerSorted = FBL.getChildByClass(headerRow, "headerSorted");
        FBL.removeClass(headerSorted, "headerSorted");
        if (headerSorted)
            headerSorted.removeAttribute('aria-sort');

        var header = headerRow.childNodes[colIndex];
        FBL.setClass(header, "headerSorted");

        if (!header.sorted || header.sorted == 1)
        {
            FBL.removeClass(header, "sortedDescending");
            FBL.setClass(header, "sortedAscending");
            header.setAttribute("aria-sort", "ascending");

            header.sorted = -1;

            for (var i = 0; i < values.length; ++i)
                tbody.appendChild(values[i].row);
        }
        else
        {
            FBL.removeClass(header, "sortedAscending");
            FBL.setClass(header, "sortedDescending");
            header.setAttribute("aria-sort", "descending")

            header.sorted = 1;

            for (var i = values.length-1; i >= 0; --i)
                tbody.appendChild(values[i].row);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Console logging

    log: function(data, cols, context)
    {
        // No arguments passed into console.table method, bail out for now,
        // but some error message could be displayed in the future.
        if (!data)
            return;

        // Get header info from passed argument (can be null).
        var columns = [];
        for (var i=0; cols && i<cols.length; i++)
        {
            var col = cols[i];
            var prop = (typeof(col.property) != "undefined") ? col.property : col;
            var label = (typeof(col.label) != "undefined") ? col.label : prop;

            columns.push({
                property: prop,
                label: label,
                alphaValue: true
            });
        }

        // Generate header info from the data dynamically.
        if (!columns.length)
            columns = this.getHeaderColumns(data);

        // Don't limit strings in the table. It should be mostly ok. In case of
        // complaints we need an option.
        var prevValue = Firebug.stringCropLength;
        Firebug.stringCropLength = -1;

        try
        {
            this.columns = columns;
            var row = Firebug.Console.log({data: data, columns: columns}, context, "table", this, true);

            // Set vertical height for scroll bar.
            var tBody = row.querySelector(".dataTableTbody");
            var maxHeight = Firebug.tabularLogMaxHeight;
            if (maxHeight > 0 && tBody.clientHeight > maxHeight)
                tBody.style.height = maxHeight + "px";
        }
        catch (err)
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("consoleInjector.table; EXCEPTION " + err, err);
        }
        finally
        {
            Firebug.stringCropLength = prevValue;
            delete this.columns;
        }
    },

    /**
     * Analyse data and return dynamically created list of columns.
     * @param {Object} data
     */
    getHeaderColumns: function(data)
    {
        // Get the first row in the object.
        var firstRow;
        for (var p in data)
        {
            firstRow = data[p];
            break;
        }

        if (typeof(firstRow) != "object")
            return [{label: Locale.$STR("firebug.reps.table.ObjectProperties")}];

        // Put together a column property, label and type (type for default sorting logic).
        var header = [];
        for (var p in firstRow)
        {
            var value = firstRow[p];
            if (!this.domFilter(value, p))
                continue;

            header.push({
                property: p,
                label: p,
                alphaValue: (typeof(value) != "number")
            });
        }

        return header;
    },

    /**
     * Filtering based on options set in the DOM panel.
     * @param {Object} value - a property value under inspection.
     * @param {String} name - name of the property.
     * @returns true if the value should be displayed, otherwise false.
     */
    domFilter: function(object, name)
    {
        var domMembers = FBL.getDOMMembers(object, name);

        if (typeof(object) == "function")
        {
            if (FBL.isDOMMember(object, name) && !Firebug.showDOMFuncs)
                return false;
            else if (!Firebug.showUserFuncs)
                return false;
        }
        else
        {
            if (FBL.isDOMMember(object, name) && !Firebug.showDOMProps)
                return false;
            else if (FBL.isDOMConstant(object, name) && !Firebug.showDOMConstants)
                return false;
            else if (!Firebug.showUserProps)
                return false;
        }

        return true;
    }
})};

// ************************************************************************************************
// Registration

return FirebugReps.Table;

// ************************************************************************************************
});
