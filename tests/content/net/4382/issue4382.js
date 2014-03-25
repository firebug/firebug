function runTest()
{
    FBTest.openNewTab(basePath + "net/4382/issue4382.html", (win) =>
    {
        FBTest.openFirebug(() =>
        {
            FBTest.enableNetPanel(() =>
            {
                var tasks = new FBTest.TaskList();
                tasks.push(verifyJSONSorting, win, "requestArray", "array",
                    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
                tasks.push(verifyJSONSorting, win, "requestObject", "object", ["a", "c", "b"]);

                tasks.run(() =>
                {
                    FBTest.testDone();
                });
            });
        });
    });
}


function verifyJSONSorting(callback, win, buttonID, type, expected)
{
    var panel = FBTest.getSelectedPanel();
    var panelNode = panel.panelNode;
    panel.clear();

    FBTest.waitForDisplayedElement("net", null, (row) =>
    {
        FBTest.click(row);
        var jsonTab = row.parentNode.getElementsByClassName("netInfoJSONTab")[0];
        if (FBTest.ok(jsonTab, "There must be a JSON tab"))
        {
            var config = {
                tagName: "table",
                classes: "domTable",
                onlyMutations: true
            };

            FBTest.waitForDisplayedElement("net", config, (domTable) =>
            {
                if (FBTest.ok(domTable, "JSON contents must exist"))
                {
                    var sortLink = panelNode.getElementsByClassName("doSort")[0];

                    verifyJSONContents(type, domTable, expected);
                    FBTest.click(sortLink);
                    verifyJSONContents(type, domTable, expected);

                    // Reset click state
                    var doNotSortLink = panelNode.getElementsByClassName("doNotSort")[0];
                    FBTest.click(doNotSortLink);
                }
            });

            FBTest.click(jsonTab);
        }

        callback();
    });

    FBTest.clickContentButton(win, buttonID);
}

// ********************************************************************************************* //
// Helpers

function verifyJSONContents(type, jsonContents, expectedItems)
{
    if (FBTest.ok(jsonContents, "JSON " + type + " contents must exist"))
    {
        var items = jsonContents.getElementsByClassName("memberRow");
        var itemsCorrect = true;
        for (var i = 0; i < items.length; i++)
        {
            var label = items[i].getElementsByClassName("memberLabelCell")[0].textContent;
            var value = parseInt(label);
            var item = (isNaN(value) ? label : value);
            if (item != expectedItems[i])
            {
                itemsCorrect = false;
                break;
            }
        }

        if (itemsCorrect)
            FBTest.ok(true, "All " + type + " items are correct");
        else
            FBTest.compare(i, label, "The " + type + " item at index " + i + " differs");
    }
}
