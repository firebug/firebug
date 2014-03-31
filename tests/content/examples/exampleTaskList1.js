function runTest()
{
    // Create a task list object.
    var tasks = new FBTest.TaskList();

    // Append a task into the list.
    tasks.push(function(callback) {
        FBTest.progress("Task 1 executed");

        setTimeout(function()
        {
            // TODO: test implementation (after an async operation)
            // Continue with other tests.
            callback();
        }, 100);
    });

    // Append another task into the list
    tasks.push(function(callback) {
        FBTest.progress("Task 2 executed");

        setTimeout(function()
        {
            // TODO: test implementation (after an async operation)
            // Continue with other tests.
            callback();
        }, 100);
    });

    // Run all.
    tasks.run(function() {
        FBTest.testDone();
    });
}
