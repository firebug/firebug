function runTest()
{
    // Create a task list object.
    var tasks = new FBTest.TaskList();

    // Append some tasks into the list.
    tasks.push(task1, "arg1", "arg2");
    tasks.push(task2);

    // Run all, with 0 timeout in between (optional argument).
    tasks.run(FBTest.testDone, 0);
}

function task1(callback, arg1, arg2)
{
    FBTest.progress("Task 1 executed: " + arg1 + ", " + arg2);

    setTimeout(function()
    {
        // TODO: test implementation (after an async operation)
        // Continue with other tests.
        callback();
    }, 100);
}

function task2(callback)
{
    FBTest.progress("Task 2 executed");

    setTimeout(function()
    {
        // TODO: test implementation (after an async operation)
        // Continue with other tests.
        callback();
    }, 100);
}
