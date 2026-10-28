import {describe,expect,it} from "vitest";
import {taskDestination,taskSections} from "../src/features/tasks/model.js";
describe("UX-018 actionable task destinations",()=>{
 it("opens every task queue natively since paket 2 (MOB-SCP-01), without needing the web origin",()=>{
  expect(taskDestination("workorder",{"workorder.execute":"assigned"},"https://school.test","12")).toEqual({native:"/work-order/12"});
  expect(taskDestination("handover",{"loan.manage":"all"},"")).toEqual({native:"/peminjaman/serah-terima"});
  expect(taskDestination("returns",{"loan.manage":"all"},"","7")).toEqual({native:"/peminjaman/7"});
  expect(taskDestination("requests",{"reservation.view":"own"},"")).toEqual({native:"/reservasi"});
 });
 it("rejects unsupported kinds, foreign URLs and missing permissions",()=>{
  expect(taskDestination("approval",{},"https://school.test","1")).toBeNull();
  expect(taskDestination("workorder",{"workorder.execute":"assigned"},"https://school.test","//evil.test")).toBeNull();
  expect(taskDestination("https://evil.test",{"loan.manage":"all"},"https://school.test")).toBeNull();
 });
 it("every advertised task has a destination for its permissions",()=>{
  const permissions={"workorder.execute":"assigned","loan.manage":"all","audit.execute":"assigned","approval.decide":"assigned","damage.verify":"all","damage.view":"all"};
  for(const item of taskSections(permissions))expect(taskDestination(item.kind,permissions,"https://school.test")).not.toBeNull();
  for(const permission of ["reservation.view","loan.view","fine.view"])for(const item of taskSections({[permission]:"own"}))expect(taskDestination(item.kind,{[permission]:"own"},"https://school.test")).not.toBeNull();
 });
});
