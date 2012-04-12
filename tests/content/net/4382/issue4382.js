function runTest()
{
    FBTest.sysout("issue4382.START");

    FBTest.openNewTab(basePath + "net/4382/issue4382.html", function(win)
    {
        FBTest.openFirebug();

        var tests = [];
        tests.push(function(callback)
        {
            FBTest.progress("Testing JSON array");
            testJSONArray(win, callback);
        });
        tests.push(function(callback)
        {
            FBTest.progress("Testing JSON object");
            testJSONObject(win, callback);
        });

        FBTest.enableNetPanel(function(win)
        {
            FBTestFirebug.runTestSuite(tests, function()
            {
                FBTest.testDone("issue4382; DONE");
            });
        });
    });
}


function testJSONArray(win, callback)
{
    var panel = FBTest.selectPanel("net");
    panel.clear();
    
    var options =
    {
        tagName: "tr",
        classes: "netRow category-xhr hasHeaders loaded"
    };
  
    FBTest.waitForDisplayedElement("net", options, function(row)
    {
        var panelNode = FBTest.selectPanel("net").panelNode;
  
        FBTest.click(row);
        if (FBTest.ok(panelNode.getElementsByClassName("netInfoJSONTab").length > 0,
            "There must be a JSON tab"))
        {
            FBTest.expandElements(panelNode, "netInfoJSONTab");
  
            var jsonBody = FW.FBL.getElementByClass(panelNode, "netInfoJSONText");
            if (FBTest.ok(jsonBody, "JSON contents must exist"))
            {
                var sortLink = panelNode.getElementsByClassName("doSort").item(0);
                var expectedItems = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

                verifyJSONContents("array", jsonBody, expectedItems);
                FBTest.click(sortLink);
                verifyJSONContents("array", jsonBody, expectedItems);

                // Reset click state
                FBTest.click(sortLink);
            }
        }
  
        callback();
    });
  
    FBTest.click(win.document.getElementById("requestArray"));
}

function testJSONObject(win, callback)
{
    var panel = FBTest.selectPanel("net");
    panel.clear();
    
    var options =
    {
        tagName: "tr",
        classes: "netRow category-xhr hasHeaders loaded"
    };
  
    FBTest.waitForDisplayedElement("net", options, function(row)
    {
        var panelNode = FBTest.selectPanel("net").panelNode;
  
        FBTest.click(row);
        if (FBTest.ok(panelNode.getElementsByClassName("netInfoJSONTab").length > 0,
            "There must be a JSON tab"))
        {
            FBTest.expandElements(panelNode, "netInfoJSONTab");
  
            var jsonBody = FW.FBL.getElementByClass(panelNode, "netInfoJSONText");
            if (FBTest.ok(jsonBody, "JSON contents must exist"))
            {
                var sortLink = panelNode.getElementsByClassName("doSort").item(0);

                verifyJSONContents("object", jsonBody, [5, 2, 15, 6, 1, 4, 10, 14, 3, 11, 9, 12, 7, 13, 8]);
                FBTest.click(sortLink);
                verifyJSONContents("object", jsonBody, [1, 10, 11, 12, 13, 14, 15, 2, 3, 4, 5, 6, 7, 8, 9]);

                // Reset click state
                FBTest.click(sortLink);
            }
        }
  
        callback();
    });

    FBTest.click(win.document.getElementById("requestObject"));
}

//********************************************************************************************* //
//Helpers

function verifyJSONContents(type, jsonBody, expectedItems)
{
    var jsonContents = jsonBody.getElementsByClassName("domTable").item(0);
    if (FBTest.ok(jsonContents, "JSON "+type+" contents must exist"))
    {
        var items = jsonContents.getElementsByClassName("memberRow");
        var itemsCorrect = true;
        for (var i=0; i<items.length; i++)
        {
            var label = items[i].getElementsByClassName("memberLabelCell").item(0).textContent;
            if (parseInt(label) != expectedItems[i])
            {
                FBTest.sysout("xxxxx "+i, {expectedItems: expectedItems, label: label});
                itemsCorrect = false;
                break;
            }
        }
        if (itemsCorrect)
            FBTest.ok(true, "All "+type+" items are correct");
        else
            FBTest.compare(i, label, "The "+type+" item at index "+i+" differs");
    }
}
