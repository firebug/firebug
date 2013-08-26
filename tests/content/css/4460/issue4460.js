function runTest()
{
    FBTest.sysout("issue4460.START");
    FBTest.openNewTab(basePath + "css/4460/issue4460.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("html");

        var tests = [];
        tests.push(test0);
        tests.push(test1);
        tests.push(test2);

        FBTest.progress("issue4460; run test suite");

        FBTest.runTestSuite(tests, function()
        {
            FBTest.testDone("issue4460; DONE");
        });
    });
}


function test0(callback)
{
    executeTest("element1", "content-box", callback);
}

function test1(callback)
{
    executeTest("element2", "padding-box", callback);
}

function test2(callback)
{
    executeTest("element3", "border-box", callback);
}

//************************************************************************************************

function executeTest(element, expectedValue, callback)
{
    FBTest.progress("issue4460; search for: " + element);

    // Search for the element within the HTML panel, which
    // automatically expands the tree
    FBTest.searchInHtmlPanel(element, function(sel)
    {
        FBTest.progress("issue4460; selection: " + sel);

        // Click on the element to make sure it's selected
        var nodeLabelBox = FW.FBL.getAncestorByClass(sel.anchorNode, "nodeLabelBox");
        var nodeTag = nodeLabelBox.querySelector(".nodeTag");
        FBTest.mouseDown(nodeTag);

        var panel = FBTest.selectSidePanel("layout");
        var boxSizing = panel.panelNode.querySelector(".layoutBoxSizing");

        // Verify the value of 'box-sizing'
        FBTest.compare(expectedValue, boxSizing.innerHTML.replace(/box-sizing:\s*/, ''),
            "Box sizing of '" + element + "' must be '" + expectedValue + "'");

        callback();
    });
}