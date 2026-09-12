# Admin Add Member Button Fix

## Root cause

The Add Member modal's submit button was explicitly disabled whenever any required field was empty or invalid:

- name
- username
- birthdate
- password
- wallet

That made the button appear permanently unavailable to the user until every validation rule was satisfied, and validation errors were rendered behind the modal in the page-level error banner.

## Fix

- The modal Add Member button is now disabled only while the request is being submitted (`savingMember`).
- Clicking Add Member with invalid/missing data now runs the existing validation and displays the error **inside the modal**.
- Opening the modal clears any previous action error.
- Closing the modal clears the modal error.
- Admin permission checking is normalized with trim/lowercase only; no new roles were added and no existing role model was changed.
- Backend authorization remains unchanged: `POST /api/members` still requires the existing `admin` role.

## Expected behavior

1. Open Add Member.
2. Button is clickable immediately.
3. Click with missing fields -> validation message appears inside modal.
4. Fill required fields -> click Add Member -> button changes to `Adding…` and prevents duplicate submission.
5. Successful response closes the modal and refreshes member data.
6. Backend still rejects unauthorized member creation.
