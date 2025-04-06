import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {MovieNightStack} from '../lib/movie-night-stack';

describe('MovieNightStack', () => {
  it('matches snapshot', () => {
    const app = new cdk.App({context: {account: 'test'}});
    const stack = new MovieNightStack(app, 'MyTestStack');

    const template = Template.fromStack(stack)
    expect(template.toJSON()).toMatchSnapshot()
  })
});
