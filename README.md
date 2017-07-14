# idembot: Automatic issue bot for GitHub

*idembot* performs is a *bot* for performing *idempotent* actions on GitHub issues and pull requests.

# Things idembot Can Do

* Add or remove labels
* Set milestone and assignees
* Close, open, lock, and unlock issues
* Leave comments

# Example Rules

* Add a "missing info" label to issues which don't have a `Version: x.y` field in their body
* Automatically remove that label when the issue is updated
* Comment on PRs that don't update the `tests/` folder
* Close issues labelled "needs response" that don't receive a response within 2 weeks
* Re-open that issue when the original poster leaves a new comment

<!--

# Walkthrough: Keeping the CTO Happy

Let's look at an example of how you might use idembot to automate part of your workflow.

Your CTO, Steve, wants an immediate response when he logs an issue on your repo.
You'd like to get an email when this happens.
For all other issues, you want to immediately move them to the "Later" milestone,
and assign them to Jesse, the normal support engineer.

To write a rule, write a function accepting a `Github.Issue` or `Github.PR`:

```ts
function acceptIssue(issue: Github.Issue) {
    // Check who wrote the issue
    if (issue.author.name === "steve_the_cto") {
        // Steve! Label this high priority and email the first time that happens
        Actions.addLabel("High Priority").onChange(() => email_me(issue.title, issue.url));
    } else {
        // Normal users; move to later milestone and assign to support
        Actions.setMilestone("Later");
        Actions.setAssignee("jesse_the_engineer");
    }
}
```

### Side Effects

Actions fire events depending on whether or not they did anything.
The `onChanged` function takes a callback that's invoked if the action caused a change.
You can use this to trigger one-time side effects.

# Action Reference

## Labels

### Adding

The `addLabel` and `addLabels` methods add labels to issues.
These labels need to already exist in GitHub, otherwise an error occurs.
```ts
// Add the 'urgent' labels. Fires onChanged if it wasn't already there
Actions.addLabel('urgent');
// Add the 'urgent' and 'bug' labels. Fires onChanged if either wasn't already there
Actions.addLabel('urgent', 'bug');
// Array version
Actions.addLabels(['urgent', 'domain: arrays', 'other]);
```

### Removing

The `removeLabel` and `removeLabels` functions work the same as their `add` counterparts.
The `onChanged` event fires if the label *was* present.

### Setting

You can specify the exact set of labels an issue should have.
The `onChanged` event fires if any label is added or removed.
```ts
Actions.setLabels('urgent', 'question');
```


>