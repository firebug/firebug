<?php
    setcookie("testingCookie", "value1");
    setcookie("TestingCookie", "value2");
    setcookie("TESTINGCookie", "value3");
    setcookie("xxxCookie", "value4");
?>

<!DOCTYPE html>
<html>
<head>
    <title>Issue 6455: Create FBTest that covers Cookies panel search</title>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
    <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
</head>
<body>
<header>
    <h1><a href="http://code.google.com/p/fbug/issues/detail?id=6455">Issue 6455</a>:
    Create FBTest that covers Cookies panel search</h1>
</header>
<div>
    <section id="description">
        <h3>Steps to reproduce</h3>
        <ol>
            <li>Open Firebug, select and enabld the Cookies panel, reload the page.</li>
            <li>Use the search box to search in the panel</li>
            <li>There should be 6 cookies displayed when you search for 'testing' (case insensitive)</li>
            <li>There should be 6 cookies displayed when you search for 'testing' (case sensitive)</li>
            <li>There should be 6 cookies displayed when you search for 'testing' (case sensitive)</li>
            <li>There should be 6 cookies displayed when you search for 'testing' (case insensitive)</li>
        </ol>
    </section>
    <footer>Jan Odvarko, &lt;odvarko@gmail.com&gt;</footer>
</div>

<div id="testing">Testing</div>

<script>
var obj = {prop: "testing"};
console.log("testing");
console.warn("Testing");
console.table("Testing");
console.log(document.getElementById("testing"));
console.log(obj);
console.time("TESTING");
console.timeEnd("TESTING");
console.info("xxx");
</script>
</body>
</html>
