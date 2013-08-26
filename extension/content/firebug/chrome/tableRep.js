/* See license.txt for terms of usage */

define([
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/chrome/reps",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/object",
    "firebug/lib/array",
],
function(Domplate, Locale, FirebugReps, Dom, Css, Obj, Arr) {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //

with (Domplate) {
FirebugReps.Table = domplate(Firebug.Rep,
{
    className: "table",
    tableClassName: "dataTable",
    tag:
        DIV({"class": "dataTableSizer", "tabindex": "-1" },
            TABLE({"class": "$tableClassName", cellspacing: 0, cellpadding: 0, width: "100%",
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
        var value = null;
        for (var i=0; i<this.columns.length; i++)
        {
            var prop = this.columns[i].property;

            // Object property is not set for this column, so display entire
            // row-value in the cell. This can happen in cases where a generic
            // object is logged using table layout. In such case there is one
            // column (no property associated) and each row represents a member
            // of the object.
            if (typeof prop == "undefined")
            {
                value = row;
            }
            else if (typeof row[prop] == "undefined")
            {
                var props = (typeof(prop) == "string") ? prop.split(".") : [prop];

                value = row;
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

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("FirebugReps.Table.getProps", {obj: obj, arr: Arr.cloneArray(obj)});

        if (obj.length)
            return Arr.cloneArray(obj);

        var arr = [];
        for (var p in obj)
        {
            var value = obj[p];
            if (this.domFilter(value, p))
                arr.push(value);
        }

        return arr;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Sorting

    onClickHeader: function(event)
    {
        var table = Dom.getAncestorByClass(event.target, "dataTable");
        var header = Dom.getAncestorByClass(event.target, "headerCell");
        if (!header)
            return;

        var numerical = !Css.hasClass(header, "alphaValue");

        var colIndex = 0;
        for (header = header.previousSibling; header; header = header.previousSibling)
            ++colIndex;

        this.sort(table, colIndex, numerical);
    },

    sort: function(table, colIndex, numerical)
    {
        var tbody = Dom.getChildByClass(table, "dataTableTbody");
        var thead = Dom.getChildByClass(table, "dataTableThead");

        var values = [];
        for (var row = tbody.childNodes[0]; row; row = row.nextSibling)
        {
            var cell = row.childNodes[colIndex];
            var value = numerical ? parseFloat(cell.textContent) : cell.textContent;
            values.push({row: row, value: value});
        }

        values.sort(function(a, b) { return a.value < b.value ? -1 : 1; });

        var headerRow = thead.firstChild;
        var headerSorted = Dom.getChildByClass(headerRow, "headerSorted");
        Css.removeClass(headerSorted, "headerSorted");
        if (headerSorted)
            headerSorted.removeAttribute('aria-sort');

        var header = headerRow.childNodes[colIndex];
        Css.setClass(header, "headerSorted");

        if (!header.sorted || header.sorted == 1)
        {
            Css.removeClass(header, "sortedDescending");
            Css.setClass(header, "sortedAscending");
            header.setAttribute("aria-sort", "ascending");

            header.sorted = -1;

            for (var i = 0; i < values.length; ++i)
                tbody.appendChild(values[i].row);
        }
        else
        {
            Css.removeClass(header, "sortedAscending");
            Css.setClass(header, "sortedDescending");
            header.setAttribute("aria-sort", "descending");

            header.sorted = 1;

            for (var i = values.length-1; i >= 0; --i)
                tbody.appendChild(values[i].row);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Console logging

    log: function(data, cols, context, object)
    {
        // No arguments passed into console.table method, bail out for now,
        // but some error message could be displayed in the future.
        if (!data)
            return;

        var columns = this.computeColumns(data, cols);

        // Don't limit strings in the table. It should be mostly ok. In case of
        // complaints we need an option.
        var prevValue = Firebug.stringCropLength;
        Firebug.stringCropLength = -1;

        try
        {
            this.columns = columns;

            var obj = object || {};
            obj.data = data;
            obj.columns = columns;

            var row = Firebug.Console.log(obj, context, "table", this, true);

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

    computeColumns: function(data, cols)
    {
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

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleInjector.table; columns", columns);

        // Generate header info from the data dynamically.
        if (!columns.length)
            columns = this.getHeaderColumns(data);

        return columns;
    },

    /**
     * Analyse data and return dynamically created list of columns.
     * @param {Object} data
     */
    getHeaderColumns: function(data)
    {
        // Get the first row in the object.
        var firstRow = null;
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
        if (typeof(object) == "function")
        {
            if (Dom.isDOMMember(object, name) && !Firebug.showDOMFuncs)
                return false;
            else if (!Firebug.showUserFuncs)
                return false;
        }
        else
        {
            if (Dom.isDOMMember(object, name) && !Firebug.showDOMProps)
                return false;
            else if (Dom.isDOMConstant(object, name) && !Firebug.showDOMConstants)
                return false;
            else if (!Firebug.showUserProps)
                return false;
        }

        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    groupable: false
});
};

// ********************************************************************************************* //
// Registration

return FirebugReps.Table;

// ********************************************************************************************* //
});
