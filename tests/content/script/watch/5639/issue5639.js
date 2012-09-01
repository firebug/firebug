function runTest()
{
    FBTest.sysout("issue5639.START");
    FBTest.openNewTab(basePath + "script/watch/5639/issue5639.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.sysout("test");
        FBTest.enableScriptPanel(function(win)
        {
            try{
                FBTest.selectPanel("script");
                var panelNode = FBTest.selectSidePanel("watches");
                FBTest.sysout(panelNode);
                alert(panelNode);
                FBTest.rightClick(panelNode, win);
                /*panelNode.style.backgroundColor = "red";
                FBTest.testDone("issue5639.DONE");*/
            }
            catch(ex)
            {
                FBTest.exception("issue5639 "+ex);
            }
        });
    });
}
