import { describe, expect, it } from "vitest";

import { operationalUpdateFromForm } from "./operations-form";

function validForm(): FormData {
  const form = new FormData();
  form.set("maintenanceEnabled", "true");
  form.set("maintenanceMessageAr", "المنصة قيد الصيانة مؤقتاً.");
  form.set("maintenanceMessageEn", "The platform is temporarily under maintenance.");
  form.set("fileScanQueuePaused", "false");
  form.set("version", "3");
  form.set("confirmCriticalAction", "true");
  return form;
}

describe("operational controls form parsing", () => {
  it("maps only strict booleans and a bounded integer version", () => {
    expect(operationalUpdateFromForm(validForm())).toMatchObject({
      maintenanceEnabled: true,
      fileScanQueuePaused: false,
      expectedVersion: 3,
      confirmedCriticalAction: true,
    });
  });

  it("rejects ambiguous state values and exponent versions", () => {
    const stateForm = validForm();
    stateForm.set("fileScanQueuePaused", "on");
    expect(() => operationalUpdateFromForm(stateForm)).toThrowError("INVALID_STATE");

    const versionForm = validForm();
    versionForm.set("version", "1e3");
    expect(() => operationalUpdateFromForm(versionForm)).toThrowError("INVALID_VERSION");
  });
});
