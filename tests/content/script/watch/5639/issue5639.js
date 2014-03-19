function runTest()
{
    FBTest.openNewTab(basePath + "script/watch/5639/issue5639.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            var panelNode = FBTest.selectSidePanel("watches").panelNode;
            var watchExpressions = ["a", "b"];
            var tasks = new FBTest.TaskList();

            // Click on a watch expression
            tasks.push(testDeleteAllWatches, panelNode,
                ".watchRow .memberValueCell",
                watchExpressions);

            // Click on the watch edition area
            tasks.push(testDeleteAllWatches, panelNode,
                ".watchEditCell", watchExpressions);

            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}

function countWatches(panelNode)
{
    return panelNode.querySelectorAll(".watchRow .memberValueCell").length;
}

function testDeleteAllWatches(callback, panelNode, targetSelector, watchExpressions)
{
    addWatches(watchExpressions.slice(0), function()
    {
        FBTest.compare(watchExpressions.length, countWatches(panelNode),
            "all the watches must be added");

        var target = panelNode.querySelector(targetSelector);

        var timeout;
        var compareAndCallback;
        var observer;

        compareAndCallback = function()
        {
            FBTest.compare(0, countWatches(panelNode), "There should not be any watch");

            clearTimeout(timeout);
            observer.disconnect();
            callback();
        };

        // the timeout is triggered if the MutationObserver has not detected
        // the deletion of the watch expressions
        timeout = setTimeout(compareAndCallback, 1000);

        observer = new MutationObserver(function(mutations)
        {
            // if there is no watch any more, we run compareAndCallback now
            // otherwise, we wait for another mutation or for the timeout
            if (countWatches(panelNode) === 0)
                compareAndCallback();
        });

        observer.observe(panelNode, {childList: true});

        FBTest.executeContextMenuCommand(target, "fbDeleteAllWatches");
    });
}

function addWatches(watchExpressions, callback)
{
    if (watchExpressions.length > 0)
    {
        FBTest.addWatchExpression(null, watchExpressions.pop(), function()
        {
            addWatches(watchExpressions, callback);
        });
    }
    else
    {
        callback();
    }
}
