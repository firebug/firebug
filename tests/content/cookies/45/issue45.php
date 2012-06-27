<?php
    setcookie("TestCookie45", "aaa+bbb", time() + 86400, "/firecookie/tests/issue45");
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Issue 45: When I copy and paste or edit a cookie contents + (plus) signs get converted to spaces.</title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<div class="topBar">
    <a href="http://code.google.com/p/firecookie/issues/detail?id=45">Issue 45</a>
</div>
<h1>Issue 45: When I copy and paste or edit a cookie contents + (plus) signs get converted to spaces.</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug and enable the <b>Cookies</b> panel.</li>
<li>Right click on <span style="color:green">TestCookie45</span> and pick Edit.</li>
<li>Don't touch anything and press OK in the dialog.</li>
<li>The cookie value must be still <span style="color:green">aaa+bbb</span> -> BUG</li>
</ol>

<i>The '+' character should not be replaced by ' ' (space).</i>

</body>
</html>
